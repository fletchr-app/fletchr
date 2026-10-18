// Wording and ordering for the team admin screens. No React, so it is tested with `npm test`.

export type TeamRole = 'archer' | 'coach' | 'admin';
export const TEAM_ROLES: { value: TeamRole; label: string }[] = [
  { value: 'archer', label: 'Archer' },
  { value: 'coach', label: 'Coach' },
  { value: 'admin', label: 'Admin' },
];
export const roleLabel = (role: string) => TEAM_ROLES.find((r) => r.value === role)?.label ?? role;

/**
 * What a role change means for who can see whose training, to show before it is confirmed.
 * Coaches and admins read the training of archers; a coach's own training is private unless they opt in.
 */
export function roleChangeWarning(from: TeamRole, to: TeamRole): string | null {
  if (from === to) return null;
  if (to === 'archer') {
    return 'As an archer their sessions, equipment and statistics become visible to the coaches of this team, and they can no longer see other archers.';
  }
  if (from === 'archer') {
    return 'As a coach they can see the archers of this team. Their own sessions stop being visible to the other coaches, unless they turn on "also shoots" on the Team screen.' +
      (to === 'admin' ? ' Admins can also manage members and invites.' : '');
  }
  return to === 'admin'
    ? 'Admins can also change roles, remove members and manage invites.'
    : 'They will no longer be able to change roles, remove members or manage invites.';
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

/** The text to send someone an invite with. */
export function inviteMessage(teamName: string, code: string, expiresAt: string, locale?: string): string {
  const until = new Date(expiresAt).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });
  return `Join ${teamName} on Archery Coach: open the app, tap "I have an invite code" and enter ${code}. The code works until ${until}.`;
}
