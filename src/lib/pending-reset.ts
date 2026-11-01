// The address a reset code was sent to, kept on the device for the hour the code works: the link in the mail carries only the
// code (an address in a link would end up in server logs), so the app needs the address from when the code was asked for.

export const PENDING_RESET_MS = 60 * 60 * 1000;

/** What to store after a code was sent to `email`. */
export const packPendingReset = (email: string, now: number) => JSON.stringify({ email, at: now });

/** The address from stored text, or null when there is none, it is too old or the text is damaged. */
export function unpackPendingReset(raw: string | null, now: number): string | null {
  if (!raw) return null;
  try {
    const { email, at } = JSON.parse(raw) as { email?: unknown; at?: unknown };
    if (typeof email !== 'string' || typeof at !== 'number') return null;
    return now - at < PENDING_RESET_MS && now >= at ? email : null;
  } catch {
    return null;
  }
}
