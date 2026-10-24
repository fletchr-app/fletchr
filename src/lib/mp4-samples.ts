// A small reader for the MP4 files the app makes itself: one H.264 video track, every frame in its own sample, no
// B-frames. It finds where each frame is in the file, which frames are keyframes, and how the picture is turned.
// Anything else (fragmented files, other codecs, B-frames) gives null, and the player scrubs with the <video> element.

export type Mp4Video = {
  /** The codec string for WebCodecs, such as avc1.64001f. */
  codec: string
  /** The avcC record: the parameter sets the decoder needs. */
  description: Uint8Array
  /** Size of the coded picture, before the rotation. */
  width: number
  height: number
  /** How the picture is turned for display: the a, b, c, d of the matrix of the track. Rotations by 90 degrees only. */
  matrix: [number, number, number, number]
  /** Where each frame is (byte offset and size), in the order they are shown. */
  samples: { offset: number; size: number }[]
  /** The numbers of the frames that can be decoded on their own, ascending. */
  keyframes: number[]
}

type Box = { type: string; start: number; body: number; end: number }

function boxes(view: DataView, from: number, to: number): Box[] {
  const found: Box[] = []
  let at = from
  while (at + 8 <= to) {
    let size = view.getUint32(at)
    const type = String.fromCharCode(view.getUint8(at + 4), view.getUint8(at + 5), view.getUint8(at + 6), view.getUint8(at + 7))
    let body = at + 8
    if (size === 1) {
      if (at + 16 > to) break
      size = Number(view.getBigUint64(at + 8))
      body = at + 16
    } else if (size === 0) size = to - at // runs to the end of the file
    if (size < body - at || at + size > to) break
    found.push({ type, start: at, body, end: at + size })
    at += size
  }
  return found
}

const child = (view: DataView, parent: Box, type: string, skip = 0) => boxes(view, parent.body + skip, parent.end).find((b) => b.type === type)

export function readMp4(buffer: ArrayBuffer): Mp4Video | null {
  try {
    return parse(buffer)
  } catch {
    return null // cut off or not what it seems to be
  }
}

function parse(buffer: ArrayBuffer): Mp4Video | null {
  const view = new DataView(buffer)
  const top = boxes(view, 0, buffer.byteLength)
  const moov = top.find((b) => b.type === 'moov')
  if (!moov || top.some((b) => b.type === 'moof') || child(view, moov, 'mvex')) return null
  for (const trak of boxes(view, moov.body, moov.end).filter((b) => b.type === 'trak')) {
    const mdia = child(view, trak, 'mdia')
    const hdlr = mdia && child(view, mdia, 'hdlr')
    if (!mdia || !hdlr || String.fromCharCode(...new Uint8Array(buffer, hdlr.body + 8, 4)) !== 'vide') continue
    const minf = child(view, mdia, 'minf')
    const stbl = minf && child(view, minf, 'stbl')
    const stsd = stbl && child(view, stbl, 'stsd')
    if (!stbl || !stsd) return null

    // The sample entry: avc1 (or avc3), a 78 byte header, then boxes, among them avcC.
    const entry = boxes(view, stsd.body + 8, stsd.end)[0]
    if (!entry || (entry.type !== 'avc1' && entry.type !== 'avc3')) return null
    const avcC = child(view, entry, 'avcC', 78)
    if (!avcC || avcC.end - avcC.body < 4) return null
    const description = new Uint8Array(buffer.slice(avcC.body, avcC.end))
    const hex = (n: number) => n.toString(16).padStart(2, '0')
    const codec = `avc1.${hex(description[1]!)}${hex(description[2]!)}${hex(description[3]!)}`
    const width = view.getUint16(entry.body + 24)
    const height = view.getUint16(entry.body + 26)

    const tkhd = child(view, trak, 'tkhd')
    if (!tkhd) return null
    const at = tkhd.body + (view.getUint8(tkhd.body) === 1 ? 60 : 40) // the matrix, 16.16 fixed point
    const fixed = (i: number) => view.getInt32(at + i * 4) / 65536
    const matrix: Mp4Video['matrix'] = [Math.round(fixed(0)), Math.round(fixed(1)), Math.round(fixed(3)), Math.round(fixed(4))]

    // Frames that are shown in another order than they are stored in (B-frames) have a composition offset.
    const ctts = child(view, stbl, 'ctts')
    if (ctts) {
      const n = view.getUint32(ctts.body + 4)
      for (let i = 0; i < n; i++) if (view.getUint32(ctts.body + 8 + i * 8 + 4) !== 0) return null
    }

    const stsz = child(view, stbl, 'stsz')
    const stsc = child(view, stbl, 'stsc')
    const chunkOffsets = child(view, stbl, 'stco') ?? child(view, stbl, 'co64')
    if (!stsz || !stsc || !chunkOffsets) return null
    const wide = chunkOffsets.type === 'co64'
    const fixedSize = view.getUint32(stsz.body + 4)
    const count = view.getUint32(stsz.body + 8)
    const sizeOf = (i: number) => (fixedSize ? fixedSize : view.getUint32(stsz.body + 12 + i * 4))
    const chunks = view.getUint32(chunkOffsets.body + 4)
    const runs = view.getUint32(stsc.body + 4)

    const samples: Mp4Video['samples'] = []
    for (let r = 0; r < runs; r++) {
      const first = view.getUint32(stsc.body + 8 + r * 12)
      const perChunk = view.getUint32(stsc.body + 8 + r * 12 + 4)
      const last = r + 1 < runs ? view.getUint32(stsc.body + 8 + (r + 1) * 12) - 1 : chunks
      for (let c = first; c <= last; c++) {
        let offset = wide ? Number(view.getBigUint64(chunkOffsets.body + 8 + (c - 1) * 8)) : view.getUint32(chunkOffsets.body + 8 + (c - 1) * 4)
        for (let s = 0; s < perChunk && samples.length < count; s++) {
          const size = sizeOf(samples.length)
          if (offset + size > buffer.byteLength) return null
          samples.push({ offset, size })
          offset += size
        }
      }
    }
    if (samples.length !== count || count === 0) return null

    const stss = child(view, stbl, 'stss')
    let keyframes: number[]
    if (stss) {
      keyframes = Array.from({ length: view.getUint32(stss.body + 4) }, (_, i) => view.getUint32(stss.body + 8 + i * 4) - 1)
    } else keyframes = samples.map((_, i) => i) // without the table every frame stands on its own
    if (keyframes[0] !== 0) return null
    return { codec, description, width, height, matrix, samples, keyframes }
  }
  return null
}
