export type AuthStatus = 'loading' | 'signedOut' | 'signedIn' | 'local'

export type AuthFacts = {
  /** The stored tokens and the local-mode flag have both been read. */
  loaded: boolean
  hasTokens: boolean
  localOn: boolean
  /** Starting local mode failed (storage error); the person stays signed out. */
  localFailed: boolean
}

/** No tokens and no flag (first launch, or tokens revoked by the server): the app is about to start local mode. */
export function needsLocal(f: AuthFacts): boolean {
  return f.loaded && !f.hasTokens && !f.localOn && !f.localFailed
}

/**
 * `signedOut` only when local mode could not be started. While it is being started the status stays `loading`, so the
 * router and the sign-in redirect in App.vue never see a signed-out phone and the first screen is Home.
 */
export function authStatus(f: AuthFacts): AuthStatus {
  if (!f.loaded || needsLocal(f)) return 'loading'
  return f.hasTokens ? 'signedIn' : f.localOn ? 'local' : 'signedOut'
}
