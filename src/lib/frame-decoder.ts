import { evictions, type Gop, gopIndex, gopsOf, prefetchTarget } from '@/lib/frame-cache'
import { type Mp4Video, readMp4 } from '@/lib/mp4-samples'

// Single frames of a clip, fast enough to follow a finger. The <video> element needs about 50 ms for every seek, so a
// drag shows one frame in six. Here the whole clip is in memory, a group of frames (a keyframe and what follows) is
// decoded at once with WebCodecs, and the groups next to the one in view are decoded ahead of the drag.

/** Frames kept as pictures (about 3 MB each at 720p). */
const BUDGET_FRAMES = 40
/** A keyframe further apart than this would need too much memory per group; the player scrubs with <video> then. */
const LONGEST_GROUP = 30

export class FrameDecoder {
  readonly frames: number
  /** The size the picture has for display, and the canvas transform [a, b, c, d, e, f] that turns a decoded frame into it. */
  readonly transform: [number, number, number, number, number, number]
  readonly width: number
  readonly height: number

  private readonly gops: Gop[]
  private readonly cache = new Map<number, ImageBitmap[]>()
  private decoder: VideoDecoder | null = null
  private sink: ((frame: VideoFrame) => void) | null = null
  private failure: Error | null = null
  private wanted = 0
  private shown = -1
  private direction: 1 | -1 = 1
  private working = false
  private closed = false

  private constructor(
    private readonly data: ArrayBuffer,
    private readonly mp4: Mp4Video,
    private readonly onFrame: (frame: number, picture: ImageBitmap) => void,
    private readonly onError: (error: Error) => void,
  ) {
    this.frames = mp4.samples.length
    this.gops = gopsOf(mp4.keyframes, this.frames)
    const [a, b, c, d] = mp4.matrix
    this.transform = [a, b, c, d, (a < 0 ? mp4.width : 0) + (c < 0 ? mp4.height : 0), (b < 0 ? mp4.width : 0) + (d < 0 ? mp4.height : 0)]
    const turned = a === 0
    this.width = turned ? mp4.height : mp4.width
    this.height = turned ? mp4.width : mp4.height
  }

  /** Null where the browser cannot decode H.264 this way or the file is not one the reader understands. */
  static async open(data: ArrayBuffer, onFrame: (frame: number, picture: ImageBitmap) => void, onError: (error: Error) => void): Promise<FrameDecoder | null> {
    if (typeof VideoDecoder === 'undefined' || typeof createImageBitmap === 'undefined') return null
    const mp4 = readMp4(data)
    if (!mp4) return null
    const longest = Math.max(...gopsOf(mp4.keyframes, mp4.samples.length).map((g) => g.end - g.start + 1))
    if (longest > LONGEST_GROUP) return null
    const config = { codec: mp4.codec, description: mp4.description, codedWidth: mp4.width, codedHeight: mp4.height }
    const support = await VideoDecoder.isConfigSupported(config).catch(() => null)
    return support?.supported ? new FrameDecoder(data, mp4, onFrame, onError) : null
  }

  /** Ask for a frame. It arrives by `onFrame` once it is decoded; asking again before that replaces the wish. */
  show(frame: number) {
    const n = Math.min(this.frames - 1, Math.max(0, frame))
    if (n !== this.wanted) this.direction = n > this.wanted ? 1 : -1
    this.wanted = n
    this.shown = -1 // the frame is drawn again even if it is the one that was drawn last
    void this.work()
  }

  close() {
    this.closed = true
    this.decoder?.close()
    this.decoder = null
    this.cache.forEach((pictures) => pictures.forEach((p) => p.close()))
    this.cache.clear()
  }

  private async work() {
    if (this.working) return
    this.working = true
    try {
      while (!this.closed) {
        const n = this.wanted
        const g = gopIndex(this.gops, n)
        if (!this.cache.has(g)) {
          await this.decodeGroup(g)
          continue // the wish may have moved on meanwhile
        }
        if (this.shown !== n) {
          this.shown = n
          this.onFrame(n, this.cache.get(g)![n - this.gops[g]!.start]!)
        }
        const next = prefetchTarget(g, this.direction, this.gops.length, (i) => this.cache.has(i))
        if (next === null) break
        await this.decodeGroup(next)
      }
    } catch (e) {
      if (!this.closed) this.onError(e as Error)
    } finally {
      this.working = false
    }
  }

  private ensureDecoder(): VideoDecoder {
    if (this.decoder && this.decoder.state === 'configured') return this.decoder
    this.decoder?.close()
    this.decoder = new VideoDecoder({
      output: (frame) => (this.sink ? this.sink(frame) : frame.close()),
      error: (e) => (this.failure = e),
    })
    this.decoder.configure({ codec: this.mp4.codec, description: this.mp4.description, codedWidth: this.mp4.width, codedHeight: this.mp4.height })
    return this.decoder
  }

  private async decodeGroup(g: number) {
    const { start, end } = this.gops[g]!
    const decoder = this.ensureDecoder()
    const pictures: Promise<ImageBitmap>[] = []
    this.sink = (frame) => {
      pictures[frame.timestamp - start] = createImageBitmap(frame).finally(() => frame.close())
    }
    for (let i = start; i <= end; i++) {
      const { offset, size } = this.mp4.samples[i]!
      decoder.decode(new EncodedVideoChunk({ type: i === start ? 'key' : 'delta', timestamp: i, data: new Uint8Array(this.data, offset, size) }))
    }
    await decoder.flush().catch(() => undefined)
    this.sink = null
    if (this.failure) throw this.failure
    const decoded = await Promise.all(pictures)
    if (decoded.length !== end - start + 1 || decoded.some((p) => !p)) throw new Error('the decoder gave fewer frames than it was given')
    if (this.closed) return decoded.forEach((p) => p.close())
    this.cache.set(g, decoded)
    for (const old of evictions([...this.cache.keys()], this.gops, gopIndex(this.gops, this.wanted), BUDGET_FRAMES)) {
      this.cache.get(old)?.forEach((p) => p.close())
      this.cache.delete(old)
    }
  }
}
