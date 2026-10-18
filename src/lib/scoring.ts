// Score of an arrow from where it hit. Same rules as server/targets/scoring.py; both are
// tested against shared/scoring-vectors.json.
//
// Position: x to the right, y up, relative to the centre of the spot the arrow is in,
// in units where 1 is the outer edge of the face's outermost scoring ring.

export type ScoringFace = {
  rings: { value: number; diameter_cm: number }[]; // inner to outer
  x_diameter_cm?: number;
};

export type Score = { value: number | null; is_x: boolean; is_miss: boolean };

// Rounding noise from the normalised coordinates must not push an arrow on a line to the lower ring.
const TOLERANCE_CM = 1e-9;
const BLANK_RADIUS_CM = 20;

/** Size of one spot, the unit of the shot coordinates. */
export function outerRadiusCm(face: ScoringFace): number {
  const outer = face.rings[face.rings.length - 1];
  return outer ? outer.diameter_cm / 2 : BLANK_RADIUS_CM;
}

/**
 * A position exactly on a line scores the higher value. The archer places an arrow that touches
 * a line into the higher ring, so the position is taken as it is.
 */
export function score(face: ScoringFace, x: number, y: number): Score {
  if (face.rings.length === 0) return { value: null, is_x: false, is_miss: false };
  const distanceCm = Math.hypot(x, y) * outerRadiusCm(face);
  for (const ring of face.rings) {
    if (distanceCm <= ring.diameter_cm / 2 + TOLERANCE_CM) {
      const xd = face.x_diameter_cm;
      const is_x = ring.value === 10 && xd !== undefined && distanceCm <= xd / 2 + TOLERANCE_CM;
      return { value: ring.value, is_x, is_miss: false };
    }
  }
  return { value: null, is_x: false, is_miss: true };
}
