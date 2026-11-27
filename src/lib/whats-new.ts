// Which "what's new" entries to show after the app was updated. No Vue, tested with `npm test`.

import { compareVersions, parseVersion } from './version.ts';

export type WhatsNewEntry = { version: string; en: string[]; de: string[] };

const older = (a: string, b: string) => {
  const x = parseVersion(a);
  const y = parseVersion(b);
  return !!x && !!y && compareVersions(x, y) < 0;
};

/**
 * The entries to show, newest first: those after the version seen last, up to the running one.
 * - `lastSeen` null and no earlier use: a fresh install, nothing to show.
 * - `lastSeen` null after earlier use: updated from a version without this feature, so only the running version is shown.
 */
export function unseenEntries(entries: WhatsNewEntry[], lastSeen: string | null, current: string, earlierUse: boolean): WhatsNewEntry[] {
  if (!parseVersion(current)) return [];
  if (lastSeen === null && !earlierUse) return [];
  const picked = entries.filter((e) => (lastSeen === null ? e.version === current : older(lastSeen, e.version) && !older(current, e.version)));
  return newestFirst(picked);
}

/** Every entry up to the running version, newest first (for the "What's new" screen in Settings). */
export function entriesUpTo(entries: WhatsNewEntry[], current: string): WhatsNewEntry[] {
  return newestFirst(entries.filter((e) => !older(current, e.version)));
}

const newestFirst = (entries: WhatsNewEntry[]) => [...entries].sort((a, b) => (older(a.version, b.version) ? 1 : older(b.version, a.version) ? -1 : 0));
