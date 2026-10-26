// Geometry for plotting arrows on a target face. No React, so it is tested with `npm test`.
//
// The face is drawn in centimetres. SVG has y pointing down and shots have y pointing up, so the
// scene flips y. A shot is stored per spot: x right, y up, 1 = outer edge of the outermost ring.

import { outerRadiusCm } from './scoring.ts';

export type PlotFace = {
  kind: string;
  rings: { value: number; diameter_cm: number }[]; // inner to outer
  spots: { x: number; y: number }[];
  x_diameter_cm?: number;
};

export type PlotPoint = { spot: number; x: number; y: number };

/** The drawn area, in cm, in SVG orientation (y down). */
export type Scene = { x0: number; y0: number; width: number; height: number; radius: number };

const MARGIN_CM = 1.5;
// The server accepts shots up to 5 radii from a spot's centre; stay well inside that.
const MAX_NORMALISED_DISTANCE = 4.5;

export function sceneOf(face: PlotFace): Scene {
  const radius = outerRadiusCm(face);
  const xs = face.spots.map((s) => s.x);
  const ys = face.spots.map((s) => -s.y);
  const x0 = Math.min(...xs) - radius - MARGIN_CM;
  const y0 = Math.min(...ys) - radius - MARGIN_CM;
  return { x0, y0, width: Math.max(...xs) + radius + MARGIN_CM - x0, height: Math.max(...ys) + radius + MARGIN_CM - y0, radius };
}

/** Pixels per cm, so the whole scene fits in the given box. */
export const fitScale = (scene: Scene, maxWidth: number, maxHeight: number) =>
  Math.min(maxWidth / scene.width, maxHeight / scene.height);

/** Where a touch at (px, py) in the drawn scene lands: the nearest spot, and the position inside it. */
export function pickAt(face: PlotFace, scene: Scene, scale: number, px: number, py: number): PlotPoint {
  const xCm = scene.x0 + px / scale;
  const yCm = -(scene.y0 + py / scale);
  let spot = 0;
  let best = Infinity;
  face.spots.forEach((s, i) => {
    const d = Math.hypot(xCm - s.x, yCm - s.y);
    if (d < best) [best, spot] = [d, i];
  });
  let x = (xCm - face.spots[spot].x) / scene.radius;
  let y = (yCm - face.spots[spot].y) / scene.radius;
  const d = Math.hypot(x, y);
  if (d > MAX_NORMALISED_DISTANCE) [x, y] = [(x / d) * MAX_NORMALISED_DISTANCE, (y / d) * MAX_NORMALISED_DISTANCE];
  return { spot, x, y };
}

/** The pixel position of a shot in the drawn scene. */
export function toPixel(face: PlotFace, scene: Scene, scale: number, shot: PlotPoint) {
  const spot = face.spots[Math.min(shot.spot, face.spots.length - 1)];
  return {
    px: (spot.x + shot.x * scene.radius - scene.x0) * scale,
    py: (-(spot.y + shot.y * scene.radius) - scene.y0) * scale,
  };
}

/** Index of the shot closest to the touch, if one is within `radiusPx`. */
export function nearestShot(points: { px: number; py: number }[], px: number, py: number, radiusPx: number): number {
  let found = -1;
  let best = radiusPx;
  points.forEach((p, i) => {
    const d = Math.hypot(p.px - px, p.py - py);
    if (d <= best) [best, found] = [d, i];
  });
  return found;
}

// --- colours ------------------------------------------------------------------------------------

const WA_COLOURS: Record<number, string> = {
  10: '#f5d037', 9: '#f5d037', 8: '#d8382f', 7: '#d8382f', 6: '#2f7fc9', 5: '#2f7fc9', 4: '#1c1c1c', 3: '#1c1c1c', 2: '#ffffff', 1: '#ffffff',
};
const FIELD_COLOURS: Record<number, string> = { 6: '#f5d037', 5: '#f5d037', 4: '#1c1c1c', 3: '#1c1c1c', 2: '#1c1c1c', 1: '#1c1c1c' };

export function ringFill(face: Pick<PlotFace, 'kind'>, value: number): string {
  return (face.kind === 'field' ? FIELD_COLOURS : WA_COLOURS)[value] ?? '#cccccc';
}

/** Ring lines are black, except on dark rings where they are white. */
export const ringLine = (fill: string) => (fill === '#1c1c1c' ? '#e8e8e8' : '#1c1c1c');
