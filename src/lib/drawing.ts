// A drawing on one frame: lines, angles and circles. Points are fractions (0 to 1) of the picture, so the drawing fits
// any screen; an angle or a length has to be worked out in the real shape of the picture, not in those fractions.

export type Tool = 'line' | 'angle' | 'circle'
/** What a finger does on the picture: draws one of the tools, or moves a point that is already there. */
export type Mode = Tool | 'move'
export type Point = [number, number]
export type Shape = { t: Tool; p: Point[]; c?: string }
export type Drawing = { v: 1; shapes: Shape[] }

/** How many points a shape has: an angle is end, corner, end; a circle is the centre and a point on it. */
export const POINTS: Record<Tool, number> = { line: 2, angle: 3, circle: 2 }
export const COLOURS = ['#ff3b30', '#ffcc00', '#34c759', '#0a84ff', '#ffffff'] as const

export const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

/** Where a pointer is on the picture, as fractions. */
export function pointOn(rect: { left: number; top: number; width: number; height: number }, clientX: number, clientY: number): Point {
  return [clamp01((clientX - rect.left) / rect.width), clamp01((clientY - rect.top) / rect.height)]
}

/** While a finger draws, the picture is magnified this much around the point that is drawn. */
export const ZOOM = 3;
/** The point that is drawn sits this many pixels above the finger, so that the finger does not cover it. */
export const LIFT = 64;

/**
 * The style that magnifies a picture around a point (in pixels of the picture, before the zoom): that point stays where
 * it is on the screen and everything around it grows. Nothing when `at` is null.
 */
export function zoomStyle(at: { x: number; y: number } | null, zoom: number = ZOOM): Record<string, string> {
  if (!at) return {};
  return { transform: `translate(${(1 - zoom) * at.x}px, ${(1 - zoom) * at.y}px) scale(${zoom})`, transformOrigin: '0 0' };
}

/** The angle at `corner` between the two other points, in degrees (0 to 180), for a picture of `width` by `height`. */
export function angleDegrees(a: Point, corner: Point, b: Point, width: number, height: number): number {
  const u = [(a[0] - corner[0]) * width, (a[1] - corner[1]) * height] as const
  const v = [(b[0] - corner[0]) * width, (b[1] - corner[1]) * height] as const
  const lengths = Math.hypot(...u) * Math.hypot(...v)
  if (lengths === 0) return 0
  const cos = (u[0] * v[0] + u[1] * v[1]) / lengths
  return (Math.acos(Math.min(1, Math.max(-1, cos))) * 180) / Math.PI
}

/** The radius of a circle in the picture's own units: as a fraction of the width, and of the height, so it can be drawn as an ellipse in a 0 to 1 box. */
export function circleRadii(centre: Point, edge: Point, width: number, height: number): { rx: number; ry: number } {
  const r = Math.hypot((edge[0] - centre[0]) * width, (edge[1] - centre[1]) * height) // in pixels of the picture
  return { rx: r / width, ry: r / height }
}

export const emptyDrawing = (): Drawing => ({ v: 1, shapes: [] })

/** The drawing from what the server sent, or an empty one. */
export function readDrawing(value: unknown): Drawing {
  const shapes = (value as Drawing | null | undefined)?.shapes
  return { v: 1, shapes: Array.isArray(shapes) ? shapes : [] }
}

/** Where the picture sits in a box when it is shown whole (object-fit: contain), for a picture of the given shape. */
export function fitted(box: { width: number; height: number }, ratio: number): { width: number; height: number } {
  if (box.width <= 0 || box.height <= 0 || !(ratio > 0)) return { width: 0, height: 0 }
  return box.width / box.height > ratio ? { width: box.height * ratio, height: box.height } : { width: box.width, height: box.width / ratio }
}

/** The point of a shape that is nearest to `at` and within `reach` pixels (the picture being `size` pixels on the screen), or null. A shape drawn later wins a tie. */
export function nearestPoint(shapes: Shape[], at: Point, size: { width: number; height: number }, reach: number): { shape: number; point: number } | null {
  let best: { shape: number; point: number } | null = null
  let bestDistance = reach
  shapes.forEach((s, shape) =>
    s.p.forEach((q, point) => {
      const d = Math.hypot((q[0] - at[0]) * size.width, (q[1] - at[1]) * size.height)
      if (d <= bestDistance) {
        bestDistance = d
        best = { shape, point }
      }
    }),
  )
  return best
}

/** The shape with one of its points somewhere else. The old shape is left alone (it may belong to a saved note). */
export const movedPoint = (shape: Shape, point: number, to: Point): Shape => ({ ...shape, p: shape.p.map((q, i) => (i === point ? to : q)) })

type Size = { width: number; height: number }

/** Every point (of any shape) that sits where the point `hit` is, within `within` pixels, the grabbed one included. Lines that end at the same place are connected: they move together. */
export function pointsAt(shapes: Shape[], hit: { shape: number; point: number }, size: Size, within = 1): { shape: number; point: number }[] {
  const at = shapes[hit.shape]?.p[hit.point]
  if (!at) return []
  const found: { shape: number; point: number }[] = []
  shapes.forEach((s, shape) =>
    s.p.forEach((q, point) => {
      if (Math.hypot((q[0] - at[0]) * size.width, (q[1] - at[1]) * size.height) <= within) found.push({ shape, point })
    }),
  )
  return found
}

/** The shapes that change when the points in `group` are moved to `to`, each with its index. The old shapes are left alone. */
export function movedGroup(shapes: Shape[], group: { shape: number; point: number }[], to: Point): { index: number; shape: Shape }[] {
  const indexes = [...new Set(group.map((g) => g.shape))]
  return indexes.map((index) => ({
    index,
    shape: { ...shapes[index]!, p: shapes[index]!.p.map((q, i) => (group.some((g) => g.shape === index && g.point === i) ? to : q)) },
  }))
}

/** `at`, or the existing point within `reach` pixels of it, so that a new angle can take its corner or ends exactly from a joint. */
export function snapped(shapes: Shape[], at: Point, size: Size, reach: number): Point {
  const hit = nearestPoint(shapes, at, size, reach)
  return hit ? shapes[hit.shape]!.p[hit.point]! : at
}
