// The server answers a refused Google sign-in with {code, detail}. The app shows its own (translated) text for the codes it knows.
const KEYS: Record<string, string> = {
  no_account: 'auth.google.noAccount',
  email_taken: 'auth.google.emailTaken',
  email_unverified: 'auth.google.emailUnverified',
  invalid_token: 'auth.google.failed',
};

/** The message key for an error body of `/api/auth/google/`, or null for an error it does not know (show the server's text). */
export function googleErrorKey(error: unknown): string | null {
  const code = error && typeof error === 'object' ? (error as { code?: unknown }).code : undefined;
  return typeof code === 'string' ? (KEYS[code] ?? null) : null;
}

/** Whether the server refused because there is no account for this Google sign-in (the person should register). */
export function isNoAccount(error: unknown): boolean {
  return googleErrorKey(error) === KEYS.no_account;
}
