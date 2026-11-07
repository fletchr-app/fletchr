/**
 * Where a pull asks from: a little before the newest server stamp it has seen. A write that took its stamp and then waited
 * for the database lock can commit after a later stamp the phone already passed, so asking from exactly that stamp could
 * miss it for good. Pulls are applied idempotently, so a change fetched twice does no harm.
 */
export const PULL_OVERLAP_MS = 60_000;

export function askSince(since: string | undefined, overlapMs = PULL_OVERLAP_MS): string | undefined {
  if (!since) return undefined;
  const at = Date.parse(since);
  return Number.isNaN(at) ? since : new Date(at - overlapMs).toISOString();
}
