export function jwtPayload(jwt: string): Record<string, unknown> | null {
  try {
    const payload = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(payload));
  } catch {
    return null;
  }
}

/** Expiry in ms since the epoch, or 0 if the token cannot be read. */
export function expiresAt(jwt: string): number {
  const exp = jwtPayload(jwt)?.exp;
  return typeof exp === 'number' ? exp * 1000 : 0;
}

/** The server sends the user id as a string ("2"); older versions sent a number. */
export function userIdOf(jwt: string): string | null {
  const id = jwtPayload(jwt)?.user_id;
  return typeof id === 'string' || typeof id === 'number' ? String(id) : null;
}
