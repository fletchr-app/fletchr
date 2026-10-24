// A drawing on one frame: lines, angles and circles. Points are fractions (0 to 1) of the picture, so the drawing fits
// any screen; an angle or a length has to be worked out in the real shape of the picture, not in those fractions.

export type Tool = 'line' | 'angle' | 'circle'
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
