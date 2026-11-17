// A pose from the model (33 landmarks, x and y as fractions of the picture) as the lines of a drawing. No Vue and no MediaPipe here.
import { clamp01, type Point, type Shape } from './drawing.ts'

export type Landmark = { x: number; y: number; visibility?: number }

// Pairs of landmark numbers (MediaPipe Pose): shoulders, hips, torso, arms, legs. Fingers, face and feet are left out.
export const BONES: [number, number][] = [
  [11, 12], [23, 24], [11, 23], [12, 24],
  [11, 13], [13, 15], [12, 14], [14, 16],
  [23, 25], [25, 27], [24, 26], [26, 28],
]

const NOSE = 0
const SHOULDERS: [number, number] = [11, 12]

const seen = (l: Landmark | undefined, min: number): l is Landmark => !!l && (l.visibility ?? 1) >= min

/** The pose that is meant when several people are found: the one whose visible points span the largest box (usually the archer in front). */
export function pickPose(poses: Landmark[][], min = 0.5): Landmark[] | null {
  let best: Landmark[] | null = null
  let bestArea = -1
  for (const pose of poses) {
    const pts = pose.filter((l) => seen(l, min))
    if (pts.length === 0) continue
    const xs = pts.map((l) => l.x)
    const ys = pts.map((l) => l.y)
    const area = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys))
    if (area > bestArea) {
      bestArea = area
      best = pose
    }
  }
  return best
}

const point = (l: Landmark): Point => [clamp01(l.x), clamp01(l.y)]

/** The lines of one pose. A line is left out when one end is not seen. The neck line goes from the middle of the shoulders to the nose. */
export function skeletonShapes(pose: Landmark[], colour: string, min = 0.5): Shape[] {
  const shapes: Shape[] = []
  for (const [a, b] of BONES) {
    const la = pose[a]
    const lb = pose[b]
    if (seen(la, min) && seen(lb, min)) shapes.push({ t: 'line', p: [point(la), point(lb)], c: colour })
  }
  const [l, r] = [pose[SHOULDERS[0]], pose[SHOULDERS[1]]]
  const nose = pose[NOSE]
  if (seen(l, min) && seen(r, min) && seen(nose, min)) {
    shapes.push({ t: 'line', p: [point({ x: (l.x + r.x) / 2, y: (l.y + r.y) / 2 }), point(nose)], c: colour })
  }
  return shapes
}
