// What a group of arrows would have scored with its centre in the middle of the spot. Same rules as
// server/targets/centred.py; both are tested against shared/centred-vectors.json.
//
// The centre is the mean position of the arrows, every arrow is moved by it and scored again. An arrow that is then
// outside the face is a miss. Positions are relative to the spot (1 = its outer edge), so the arrows of all spots
// of a face are taken together.

import { pySum } from './py-math.ts';
import { score, type ScoringFace } from './scoring.ts';

/** Fewer arrows say too little about where the centre is. */
export const MIN_ARROWS = 6;

export type CentredScore = { n: number; real: number; centred: number; centreX: number; centreY: number };

const pointsOf = (face: ScoringFace, points: { x: number; y: number }[], dx = 0, dy = 0) =>
  points.reduce((sum, p) => sum + (score(face, p.x - dx, p.y - dy).value ?? 0), 0);

/** Null for a face without rings and for fewer than MIN_ARROWS arrows. */
export function centredScore(face: ScoringFace, points: { x: number; y: number }[]): CentredScore | null {
  if (face.rings.length === 0 || points.length < MIN_ARROWS) return null;
  const centreX = pySum(points.map((p) => p.x)) / points.length;
  const centreY = pySum(points.map((p) => p.y)) / points.length;
  return { n: points.length, real: pointsOf(face, points), centred: pointsOf(face, points, centreX, centreY), centreX, centreY };
}
