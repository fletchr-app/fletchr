// Where a group of arrows sits and how tight it is. Positions are per spot: x right, y up, 1 = the
// spot's outer edge. No React, so it is tested with `npm test`.

export type Group = {
  n: number;
  /** Centre of the group (mean position of the arrows). */
  cx: number;
  cy: number;
  /** Mean distance of the arrows from the centre: 0 for a single arrow. */
  meanRadius: number;
};

export function groupOf(points: { x: number; y: number }[]): Group | null {
  if (points.length === 0) return null;
  const n = points.length;
  const cx = points.reduce((sum, p) => sum + p.x, 0) / n;
  const cy = points.reduce((sum, p) => sum + p.y, 0) / n;
  const meanRadius = points.reduce((sum, p) => sum + Math.hypot(p.x - cx, p.y - cy), 0) / n;
  return { n, cx, cy, meanRadius };
}

import { formatLength, type Units } from './units.ts';

export type CentreWords = { left: string; right: string; low: string; high: string; middle: string };
const ENGLISH: CentreWords = { left: 'left', right: 'right', low: 'low', high: 'high', middle: 'in the middle' };

/** What a group says about the sight: which way and how far the centre is from the middle of the spot. */
export function describeCentre(group: Group, spotRadiusCm: number, words: CentreWords = ENGLISH, units: Units = 'metric'): string {
  const cm = (value: number) => formatLength(Math.abs(value), units);
  const x = group.cx * spotRadiusCm;
  const y = group.cy * spotRadiusCm;
  const parts: string[] = [];
  if (Math.abs(x) >= 0.05) parts.push(`${cm(x)} ${x < 0 ? words.left : words.right}`);
  if (Math.abs(y) >= 0.05) parts.push(`${cm(y)} ${y < 0 ? words.low : words.high}`);
  return parts.length > 0 ? parts.join(', ') : words.middle;
}

export const spreadCm = (group: Group, spotRadiusCm: number) => group.meanRadius * spotRadiusCm;

export type SightMove = { horizontal: 'left' | 'right' | null; vertical: 'up' | 'down' | null };

const SIGHT_MIN_ARROWS = 6;
const SIGHT_MIN_CM = 0.5;

/**
 * Which way to move the sight, from where the group sits: towards the group (a group low and left means the
 * sight goes down and left). Null when the group is too small to say, or less than half a centimetre off on both axes.
 */
export function sightMove(group: Group, spotRadiusCm: number): SightMove | null {
  if (group.n < SIGHT_MIN_ARROWS) return null;
  const x = group.cx * spotRadiusCm;
  const y = group.cy * spotRadiusCm;
  const horizontal = Math.abs(x) >= SIGHT_MIN_CM ? (x < 0 ? 'left' : 'right') : null;
  const vertical = Math.abs(y) >= SIGHT_MIN_CM ? (y < 0 ? 'down' : 'up') : null;
  return horizontal || vertical ? { horizontal, vertical } : null;
}
