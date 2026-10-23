// The rows of a list of sessions: those on this device (can be edited) and those only the server has.
import type { components } from './api-types.ts';
import { type LogSession, sessionTotals } from './log-model.ts';

export type SessionRow = {
  id: string;
  to: string;
  started_at: string;
  type: string;
  location: string;
  finished: boolean;
  ends: number;
  arrows: number;
  points: number;
};

type Summary = components['schemas']['SessionSummary'];

/** Newest first. A session known on both sides is shown from the device, where it can still be edited. */
export function sessionRows(local: LogSession[], remote: Summary[]): SessionRow[] {
  return [
    ...local.map((s) => {
      const { arrows, score } = sessionTotals(s);
      return { id: s.id, to: `/training/${s.id}`, started_at: s.started_at, type: s.type, location: s.location, finished: !!s.ended_at, ends: s.ends.length, arrows, points: score };
    }),
    ...remote
      .filter((s) => !local.some((l) => l.id === s.id))
      .map((s) => ({
        id: s.id, to: `/sessions/${s.id}`, started_at: s.started_at, type: s.type, location: s.location ?? '',
        finished: !!s.ended_at, ends: s.ends, arrows: s.scored_arrows + s.volume_arrows, points: s.score_total,
      })),
  ].sort((a, b) => b.started_at.localeCompare(a.started_at));
}

/** Monday 00:00 of the week `now` is in, on this device's clock (the server's statistics count weeks from Monday too). */
export function weekStart(now: Date): Date {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return start;
}

/** Arrows (scored or only counted) of the sessions that started on or after `from`. */
export function arrowsSince(rows: SessionRow[], from: Date): number {
  return rows.filter((r) => new Date(r.started_at) >= from).reduce((sum, r) => sum + r.arrows, 0);
}
