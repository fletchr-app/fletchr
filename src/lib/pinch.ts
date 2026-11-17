// Pinching and panning a picture with the fingers. A view is where the picture is: `scale` (1 is the whole picture in its box) and
// the shift `x`, `y` in pixels of its top left corner, with the transform origin at that corner. Points are in pixels, from the
// top left corner of the picture before the transform (the corner it would have at scale 1).
export type View = { scale: number; x: number; y: number }
export type Pt = { x: number; y: number }
type Size = { width: number; height: number }

export const MAX_SCALE = 8
export const whole = (): View => ({ scale: 1, x: 0, y: 0 })

/** The view with a scale of at least 1 and at most `max`, and the picture still covering its box (no empty edge shows). */
export function clampView(v: View, size: Size, max = MAX_SCALE): View {
  const scale = Math.min(max, Math.max(1, v.scale))
  if (scale === 1) return whole()
  return { scale, x: Math.min(0, Math.max(size.width * (1 - scale), v.x)), y: Math.min(0, Math.max(size.height * (1 - scale), v.y)) }
}

const middle = ([a, b]: [Pt, Pt]): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
const apart = ([a, b]: [Pt, Pt]) => Math.hypot(a.x - b.x, a.y - b.y)

/** Two fingers went from `from` to `to`: the picture grows by how much they moved apart, and the point that was between them stays between them. */
export function pinched(start: View, from: [Pt, Pt], to: [Pt, Pt], size: Size, max = MAX_SCALE): View {
  const before = apart(from)
  const scale = Math.min(max, Math.max(1, before > 0 ? (start.scale * apart(to)) / before : start.scale))
  const m0 = middle(from)
  const m1 = middle(to)
  const px = (m0.x - start.x) / start.scale // the point of the picture (at scale 1) that was between the fingers
  const py = (m0.y - start.y) / start.scale
  return clampView({ scale, x: m1.x - scale * px, y: m1.y - scale * py }, size, max)
}

/** One finger moved by `dx`, `dy`: the picture follows. */
export const panned = (start: View, dx: number, dy: number, size: Size, max = MAX_SCALE): View => clampView({ ...start, x: start.x + dx, y: start.y + dy }, size, max)

/** The view magnified to `scale` around `at` (pixels, as above): the point of the picture under `at` stays under it. */
export function zoomedAt(start: View, at: Pt, scale: number, size: Size, max = MAX_SCALE): View {
  const px = (at.x - start.x) / start.scale
  const py = (at.y - start.y) / start.scale
  const next = Math.min(max, Math.max(1, scale))
  return clampView({ scale: next, x: at.x - next * px, y: at.y - next * py }, size, max)
}
