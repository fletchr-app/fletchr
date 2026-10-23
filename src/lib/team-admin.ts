// Wording and ordering for the team admin screens. No React, so it is tested with `npm test`.

export type TeamRole = 'archer' | 'coach' | 'admin';
export const TEAM_ROLES: TeamRole[] = ['archer', 'coach', 'admin'];

/**
 * What a role change means for who can see whose training, to show before it is confirmed: the key of the
 * text (roleChange.*), or null when nothing changes. Coaches and admins read the training of archers; a
 * coach's own training is private unless they opt in.
 */
export function roleChangeWarning(from: TeamRole, to: TeamRole): string | null {
  if (from === to) return null;
  if (to === 'archer') return 'roleChange.toArcher';
  if (from === 'archer') return to === 'admin' ? 'roleChange.archerToAdmin' : 'roleChange.archerToCoach';
  return to === 'admin' ? 'roleChange.coachToAdmin' : 'roleChange.adminToCoach';
}

const rank: Record<string, number> = { admin: 0, coach: 1, archer: 2 };

/** Admins first, then coaches, then archers, each by name. */
export function sortMembers<T extends { role: string; name: string; email: string }>(members: T[]): T[] {
  return [...members].sort(
    (a, b) =>
      (rank[a.role] ?? 3) - (rank[b.role] ?? 3) ||
      (a.name || a.email).localeCompare(b.name || b.email, undefined, { sensitivity: 'base' }),
  );
}

/** The day a code stops working, as the reader's language writes it (for the share texts). */
export function untilDate(expiresAt: string, locale?: string): string {
  return new Date(expiresAt).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });
}
