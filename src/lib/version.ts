// Does this app fit the server it talks to? The server says its version and the oldest app that works with it.

export type Compatibility = 'ok' | 'appTooOld' | 'serverOlder'

/** "0.5.1" as [0, 5, 1]; null when it is not a version. */
export function parseVersion(text: string | null | undefined): [number, number, number] | null {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(text ?? '')
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null
}

/** Negative when a is older than b, 0 when they are the same, positive when a is newer. */
export function compareVersions(a: [number, number, number], b: [number, number, number]): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2]
}

/**
 * - appTooOld: the server's minimum is above this app.
 * - serverOlder: the server is behind this app by a minor version or more, so things the app offers may be missing there
 *   (a note's frame would be dropped without a word). A different patch version changes nothing.
 * Anything unknown (an old server does not say a minimum, an unreachable one says nothing) counts as fine.
 */
export function compatibility(app: string, server: string | null | undefined, minApp: string | null | undefined): Compatibility {
  const a = parseVersion(app)
  const s = parseVersion(server)
  const m = parseVersion(minApp)
  if (!a) return 'ok'
  if (m && compareVersions(a, m) < 0) return 'appTooOld'
  if (s && (s[0] < a[0] || (s[0] === a[0] && s[1] < a[1]))) return 'serverOlder'
  return 'ok'
}
