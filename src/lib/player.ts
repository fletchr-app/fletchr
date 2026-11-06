// The arithmetic of the clip player: frames, times and the scrubber tape. The player works in frames, because that
// is what an archer looks at (a release, the frame the string clears the fingers); times follow from the frame rate.

export const SPEEDS = [1, 0.5, 0.25, 0.1] as const

type Clip = { capture_fps?: number | null; frame_count?: number | null; duration_ms?: number | null }

/** Frames per second on the timeline of the file. The count and the length tell it more exactly than the label. */
export function frameRate(clip: Clip): number {
  if (clip.frame_count && clip.duration_ms && clip.frame_count > 1 && clip.duration_ms > 0) return (clip.frame_count * 1000) / clip.duration_ms
  return clip.capture_fps && clip.capture_fps > 0 ? clip.capture_fps : 30
}

export function totalFrames(durationS: number, fps: number): number {
  return Math.max(1, Math.round(durationS * fps))
}

const clamp = (n: number, low: number, high: number) => Math.min(high, Math.max(low, n))

/** The frame shown at a time. */
export function frameAt(seconds: number, fps: number, total: number): number {
  return clamp(Math.floor(seconds * fps + 1e-6), 0, total - 1)
}

/** Where to seek to show a frame: the middle of it, so a rounding error does not land on its neighbour. */
export function seekTime(frame: number, fps: number, durationS: number): number {
  return clamp((frame + 0.5) / fps, 0, Math.max(0, durationS - 0.001))
}

/** The position (in frames, fractions while dragging) after the tape was dragged by `dx` pixels. Dragging left goes forward. */
export function scrubbed(start: number, dx: number, pxPerFrame: number, total: number): number {
  return clamp(start - dx / pxPerFrame, 0, total - 1)
}

export function stepped(frame: number, delta: number, total: number): number {
  return clamp(Math.round(frame) + delta, 0, total - 1)
}

/**
 * A swipe on the picture: -1 for the one before (finger to the right), 1 for the next (finger to the left), 0 when it
 * was a tap, too short, too slow or more up and down than sideways.
 */
export function swipeStep(dx: number, dy: number, ms: number): -1 | 0 | 1 {
  if (ms > 600 || Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return 0
  return dx < 0 ? 1 : -1
}

/** Seconds with milliseconds, like the clock of a stopwatch: 1.250. */
export function clock(seconds: number): string {
  return Math.max(0, seconds).toFixed(3)
}

/** The next speed in the row 1x, 0.5x, 0.25x, 0.1x, then 1x again. */
export function nextSpeed(speed: number): number {
  const i = SPEEDS.findIndex((s) => s === speed)
  return SPEEDS[(i + 1) % SPEEDS.length]!
}

export function speedLabel(speed: number): string {
  return `${speed}x`
}
