// Checks for the account screen that need no server. The server checks everything again (the password rules too).

export const MIN_PASSWORD_LENGTH = 8;

/** What is wrong with a password change form, or null when it can be sent. */
export function passwordFormError(current: string, next: string, repeat: string): string | null {
  if (!current) return 'Enter your current password';
  if (next.length < MIN_PASSWORD_LENGTH) return `The new password needs at least ${MIN_PASSWORD_LENGTH} characters`;
  if (next !== repeat) return 'The two new passwords are not the same';
  if (next === current) return 'Choose a password different from the current one';
  return null;
}

/** What is wrong with an email change form, or null when it can be sent. */
export function emailFormError(current: string, next: string, currentEmail: string): string | null {
  if (!current) return 'Enter your current password';
  const address = next.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) return 'Enter an email address';
  if (address.toLowerCase() === currentEmail.toLowerCase()) return 'This is already your address';
  return null;
}
