// Checks for the account screen that need no server. The server checks everything again (the password rules too).
// A problem is the key of its text (account.errors.*) and the values it needs, so the screen can say it in its language.

export const MIN_PASSWORD_LENGTH = 8;

export type Problem = { key: string; params?: Record<string, unknown> };

/** What is wrong with a password change form, or null when it can be sent. */
export function passwordFormError(current: string, next: string, repeat: string): Problem | null {
  if (!current) return { key: 'account.errors.currentRequired' };
  if (next.length < MIN_PASSWORD_LENGTH) return { key: 'account.errors.passwordShort', params: { n: MIN_PASSWORD_LENGTH } };
  if (next !== repeat) return { key: 'account.errors.notSame' };
  if (next === current) return { key: 'account.errors.sameAsOld' };
  return null;
}

/** What is wrong with an email change form, or null when it can be sent. */
export function emailFormError(current: string, next: string, currentEmail: string): Problem | null {
  if (!current) return { key: 'account.errors.currentRequired' };
  const address = next.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) return { key: 'account.errors.emailInvalid' };
  if (address.toLowerCase() === currentEmail.toLowerCase()) return { key: 'account.errors.emailSame' };
  return null;
}
