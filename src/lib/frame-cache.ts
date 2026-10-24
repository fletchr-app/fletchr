// Which frames the player decodes and keeps. A frame can only be decoded from the keyframe before it, so frames are
// handled in groups: a keyframe and what follows it up to the next keyframe. Scrubbing decodes the group of the frame
// that is wanted, then the groups next to it in the direction of the drag, and drops the ones farthest away.

export type Gop = { start: number; end: number } // frame numbers, both included

export function gopsOf(keyframes: number[], total: number): Gop[] {
  return keyframes.map((start, i) => ({ start, end: (keyframes[i + 1] ?? total) - 1 }))
}

/** The index of the group a frame is in. */
export function gopIndex(gops: Gop[], frame: number): number {
  let low = 0
  let high = gops.length - 1
  while (low < high) {
    const mid = Math.ceil((low + high) / 2)
    if (gops[mid]!.start <= frame) low = mid
    else high = mid - 1
  }
  return low
}

/** The group to decode next while nothing is wanted: ahead of the drag first, then behind it. Null when both are there. */
export function prefetchTarget(current: number, direction: 1 | -1, count: number, have: (gop: number) => boolean): number | null {
  for (const g of [current + direction, current - direction]) {
    if (g >= 0 && g < count && !have(g)) return g
  }
  return null
}

/** The groups to drop so that at most `budget` frames stay: the farthest from the current one first. The current one stays. */
export function evictions(cached: number[], gops: Gop[], current: number, budget: number): number[] {
  const size = (g: number) => gops[g]!.end - gops[g]!.start + 1
  const byDistance = [...cached].sort((a, b) => Math.abs(a - current) - Math.abs(b - current))
  let used = 0
  const drop: number[] = []
  for (const g of byDistance) {
    used += size(g)
    if (used > budget && g !== current) drop.push(g)
  }
  return drop
}
