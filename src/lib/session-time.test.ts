import { describe, expect, it } from 'vitest'

import { canReopen, MAX_BACKDATE_DAYS, sessionTimes, startRange, toLocalValue } from './session-time'

// Local time of the machine running the tests; the expectations are built the same way.
const now = new Date(2026, 9, 29, 12, 0)
const local = (y: number, mo: number, d: number, h: number, mi = 0) => toLocalValue(new Date(y, mo, d, h, mi))

describe('sessionTimes', () => {
  it('starts an open session for now', () => {
    expect(sessionTimes(toLocalValue(now), 120, now)).toEqual({ started_at: now.toISOString(), ended_at: null })
  })
  it('keeps a start a few minutes ago open', () => {
    const r = sessionTimes(local(2026, 9, 29, 11, 50), 120, now)
    expect(r).toEqual({ started_at: new Date(2026, 9, 29, 11, 50).toISOString(), ended_at: null })
  })
  it('finishes a session of yesterday after the duration', () => {
    const r = sessionTimes(local(2026, 9, 28, 17), 120, now)
    expect(r).toEqual({ started_at: new Date(2026, 9, 28, 17).toISOString(), ended_at: new Date(2026, 9, 28, 19).toISOString() })
  })
  it('does not end after now', () => {
    const r = sessionTimes(local(2026, 9, 29, 11), 240, now)
    expect(r).toEqual({ started_at: new Date(2026, 9, 29, 11).toISOString(), ended_at: now.toISOString() })
  })
  it('refuses the future', () => {
    expect(sessionTimes(local(2026, 9, 29, 13), 120, now)).toEqual({ error: 'newSession.inFuture' })
    expect(sessionTimes('nonsense', 120, now)).toEqual({ error: 'newSession.inFuture' })
  })
  it('allows the limit and refuses one day more', () => {
    const edge = new Date(now)
    edge.setDate(edge.getDate() - MAX_BACKDATE_DAYS)
    expect(sessionTimes(toLocalValue(edge), 60, now)).not.toHaveProperty('error')
    edge.setDate(edge.getDate() - 1)
    expect(sessionTimes(toLocalValue(edge), 60, now)).toEqual({ error: 'newSession.tooOld' })
  })
  it('stores UTC with Z, so the strings still sort', () => {
    const r = sessionTimes(local(2026, 9, 28, 23, 30), 60, now)
    expect('started_at' in r && r.started_at).toMatch(/Z$/)
  })
})

describe('time zone', () => {
  it('stores the instant the phone shows, so the day is the picked one', () => {
    const r = sessionTimes('2026-10-28T23:30:00', 60, now)
    if ('error' in r) throw new Error(r.error)
    const back = new Date(r.started_at)
    expect([back.getFullYear(), back.getMonth(), back.getDate(), back.getHours(), back.getMinutes()]).toEqual([2026, 9, 28, 23, 30])
  })
  it('keeps the picked day across the clock change (25 October 2026 in Central Europe)', () => {
    const r = sessionTimes('2026-10-25T23:30:00', 60, new Date(2026, 9, 26, 12))
    if ('error' in r) throw new Error(r.error)
    expect(new Date(r.started_at).getDate()).toBe(25)
    expect(new Date(r.ended_at!).getTime() - new Date(r.started_at).getTime()).toBe(3_600_000)
  })
})

describe('startRange and canReopen', () => {
  it('bounds the picker', () => {
    const { min, max } = startRange(now)
    expect(max).toBe(toLocalValue(now))
    expect(min < max).toBe(true)
  })
  it('does not reopen a session of yesterday', () => {
    expect(canReopen({ started_at: new Date(2026, 9, 28, 17).toISOString() }, now)).toBe(false)
    expect(canReopen({ started_at: new Date(2026, 9, 29, 10).toISOString() }, now)).toBe(true)
  })
})
