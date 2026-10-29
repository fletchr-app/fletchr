/** Start and end of a session that is started after the fact (a training of yesterday). Pure; messages are keys. */
import type { LogSession } from './log-model'

/** How far back a session can be started. Checked in the app only. */
export const MAX_BACKDATE_DAYS = 31
/** A start further back than this makes a finished session; up to it, it is an open session that was started a little late. */
export const BACKDATE_THRESHOLD_MIN = 15
export const DURATIONS_MIN = [60, 90, 120, 180, 240]
export const DEFAULT_DURATION_MIN = 120
/** The server joins open sessions for 4 hours (`training/merge.py`), so an older one must not be reopened. */
export const OPEN_SESSION_CAP_MIN = 240

const pad = (n: number) => String(n).padStart(2, '0')

/** A local date and time as `YYYY-MM-DDTHH:mm:ss`, the form `IonDatetime` takes and gives (no offset). */
export function toLocalValue(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`
}

/** Bounds for the picker. */
export function startRange(now: Date): { min: string; max: string } {
  const min = new Date(now)
  min.setDate(min.getDate() - MAX_BACKDATE_DAYS)
  return { min: toLocalValue(min), max: toLocalValue(now) }
}

export function isPast(start: Date, now: Date): boolean {
  return now.getTime() - start.getTime() > BACKDATE_THRESHOLD_MIN * 60_000
}

export type SessionTimes = { started_at: string; ended_at: string | null }

/**
 * The times to store for a start picked in local time. Always UTC with `Z` (`sessionRows` sorts the strings).
 * A start in the past gives a finished session, ending after `durationMin` but not later than now.
 */
export function sessionTimes(startLocal: string, durationMin: number, now: Date): SessionTimes | { error: 'newSession.inFuture' | 'newSession.tooOld' } {
  const start = new Date(startLocal)
  if (Number.isNaN(start.getTime()) || start.getTime() > now.getTime() + 60_000) return { error: 'newSession.inFuture' }
  const oldest = new Date(now)
  oldest.setDate(oldest.getDate() - MAX_BACKDATE_DAYS)
  if (start.getTime() < oldest.getTime()) return { error: 'newSession.tooOld' }
  if (!isPast(start, now)) return { started_at: start.toISOString(), ended_at: null }
  const end = Math.min(start.getTime() + durationMin * 60_000, now.getTime())
  return { started_at: start.toISOString(), ended_at: new Date(end).toISOString() }
}

/** Reopening a session that started long ago would make it live and give it a window capped at 4 hours. */
export function canReopen(session: Pick<LogSession, 'started_at'>, now: Date = new Date()): boolean {
  return now.getTime() - new Date(session.started_at).getTime() <= OPEN_SESSION_CAP_MIN * 60_000
}
