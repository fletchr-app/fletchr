// The figures of one finished session, worked out from the ends on this device. Pure, no Vue.
import { endTotal, type LogSession, shotPoints } from './log-model.ts';

export type EndFigure = { index: number; total: number; arrows: number; average: number };
export type SessionFigures = {
  arrows: number;
  score: number;
  /** Average points per arrow, 0 without arrows. */
  average: number;
  /** Average points per end, 0 without ends. */
  perEnd: number;
  /** Arrows that scored the session's best value, and how many of those were an X. */
  best: number;
  bestValue: number;
  xs: number;
  misses: number;
};

/** One figure for each end, in the order shot. */
export function endFigures(session: Pick<LogSession, 'ends'>): EndFigure[] {
  return session.ends.map((end, i) => {
    const total = endTotal(end);
    return { index: i, total, arrows: end.shots.length, average: end.shots.length > 0 ? total / end.shots.length : 0 };
  });
}

export function figuresOf(session: Pick<LogSession, 'ends'>): SessionFigures {
  const shots = session.ends.flatMap((e) => e.shots);
  const score = session.ends.reduce((sum, e) => sum + endTotal(e), 0);
  const bestValue = shots.reduce((max, s) => Math.max(max, s.is_miss ? 0 : (s.value ?? 0)), 0);
  return {
    arrows: shots.length,
    score,
    average: shots.length > 0 ? score / shots.length : 0,
    perEnd: session.ends.length > 0 ? score / session.ends.length : 0,
    best: bestValue > 0 ? shots.filter((s) => !s.is_miss && s.value === bestValue).length : 0,
    bestValue,
    xs: shots.filter((s) => s.is_x && !s.is_miss).length,
    misses: shots.filter((s) => s.is_miss).length,
  };
}

/** How many arrows scored each value, best first down to 0 (a miss), for `DistributionBars`. */
export function distributionOf(session: Pick<LogSession, 'ends'>): { value: number; count: number }[] {
  const counts = new Map<number, number>();
  for (const shot of session.ends.flatMap((e) => e.shots)) counts.set(shotPoints(shot), (counts.get(shotPoints(shot)) ?? 0) + 1);
  const top = Math.max(0, ...counts.keys());
  return Array.from({ length: top + 1 }, (_, i) => ({ value: top - i, count: counts.get(top - i) ?? 0 }));
}

/**
 * The average per arrow in the first and in the second half of the ends, to show whether the archer tired.
 * Null under 4 ends (too little to compare), and the middle end of an odd number is left out.
 */
export function halves(session: Pick<LogSession, 'ends'>): { first: number; second: number } | null {
  const ends = endFigures(session);
  if (ends.length < 4) return null;
  const half = Math.floor(ends.length / 2);
  const average = (part: EndFigure[]) => {
    const arrows = part.reduce((n, e) => n + e.arrows, 0);
    return arrows > 0 ? part.reduce((sum, e) => sum + e.total, 0) / arrows : 0;
  };
  return { first: average(ends.slice(0, half)), second: average(ends.slice(ends.length - half)) };
}
