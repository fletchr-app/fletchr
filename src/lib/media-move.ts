// Which photos and videos belong near a session, and which session to offer first when one is moved. Without Vue.

const HOUR_MS = 3_600_000
/** An unfinished session counts as this long (the same cap the server uses when it merges sessions). */
const OPEN_SESSION_MS = 4 * HOUR_MS
/** Warming up and the photo on the way home. */
const MARGIN_MS = HOUR_MS

export type Timed = { started_at: string; ended_at?: string | null }
export type Pickable = Timed & { id: string }

/** From an hour before the start to an hour after the end; an unfinished session lasts four hours. In ms since the epoch. */
export function nearWindow(session: Timed): { from: number; to: number } {
  const start = new Date(session.started_at).getTime()
  const end = session.ended_at ? new Date(session.ended_at).getTime() : start + OPEN_SESSION_MS
  return { from: start - MARGIN_MS, to: Math.max(start, end) + MARGIN_MS }
}

/** Taken in the window of the session (the end of the window is not part of it, like the `taken_before` of the server). */
export function isNear(takenAt: string, session: Timed): boolean {
  const { from, to } = nearWindow(session)
  const at = new Date(takenAt).getTime()
  return at >= from && at < to
}

function distance(takenAt: number, session: Timed): number {
  const { from, to } = nearWindow(session)
  return takenAt < from ? from - takenAt : takenAt >= to ? takenAt - to : 0
}

/** The session that fits the time best first (the one it was taken in, else the closest), then the others, newest first. */
export function pickerOrder<T extends Pickable>(sessions: T[], takenAt: string): T[] {
  const at = new Date(takenAt).getTime()
  const newest = [...sessions].sort((a, b) => b.started_at.localeCompare(a.started_at))
  let best: T | undefined
  let bestDistance = Infinity
  for (const s of newest) {
    const d = distance(at, s)
    if (d < bestDistance) [best, bestDistance] = [s, d]
  }
  return best ? [best, ...newest.filter((s) => s !== best)] : newest
}
