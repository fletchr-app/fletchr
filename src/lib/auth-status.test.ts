import { describe, expect, it } from 'vitest'

import { authStatus, needsLocal } from './auth-status'

const base = { loaded: true, hasTokens: false, localOn: false, localFailed: false }

describe('authStatus', () => {
  it('is loading until tokens and flag are read', () => {
    expect(authStatus({ ...base, loaded: false })).toBe('loading')
  })

  it('stays loading on a first launch (no tokens, no flag) while local mode starts, never signedOut', () => {
    expect(needsLocal(base)).toBe(true)
    expect(authStatus(base)).toBe('loading')
  })

  it('is local once the flag is on', () => {
    expect(needsLocal({ ...base, localOn: true })).toBe(false)
    expect(authStatus({ ...base, localOn: true })).toBe('local')
  })

  it('is signedIn with tokens, flag on or off', () => {
    expect(authStatus({ ...base, hasTokens: true })).toBe('signedIn')
    expect(authStatus({ ...base, hasTokens: true, localOn: true })).toBe('signedIn')
    expect(needsLocal({ ...base, hasTokens: true })).toBe(false)
  })

  it('is signedOut only when starting local mode failed', () => {
    expect(authStatus({ ...base, localFailed: true })).toBe('signedOut')
    expect(needsLocal({ ...base, localFailed: true })).toBe(false)
  })
})
