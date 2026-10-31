// The trainings and events of your teams as entries in a calendar the app owns on the phone (#107). No Vue, no Capacitor:
// the phone's calendar holds the whole state (every entry ends with a tag line: our key and a hash of what we wrote), so a
// sync is a diff between what should be there and what is, safe to repeat and safe after a crash halfway.
//
// One entry per training, not a repeating series: Android's calendar provider cannot cancel a single occurrence of a series
// in a local calendar (NullPointerException in `handleInsertException`, checked on a phone), and cancelled, moved and paused
// trainings are exactly what a schedule has. The server has already worked out every occurrence, DST included.
import { type AgendaItem, type EventKind } from './schedule.ts';

/** The words an entry is made of; the caller translates (`src/lib` builds no sentences). */
export type Texts = {
  kind: Record<EventKind, string>;
  /** The line above the tag, e.g. "Training of <team>, from the Fletchr app". */
  note: (team: string) => string;
};

/** Something to write: one entry. Times are instants in ms. */
export type Entry = {
  /** `event:<agenda id>`. */
  key: string;
  hash: string;
  title: string;
  location: string;
  description: string;
  start: number;
  end: number;
  /** Minutes relative to the start, negative before it. */
  alerts: number[];
};

/** What the phone's calendar returns for our calendar: one row per entry. */
export type Instance = { id: string; startDate: number; description: string | null };

export type Window = { from: number; to: number };

export const TAG = 'fletchr';
const TAG_LINE = /^fletchr:(event:[\w-]+):([0-9a-f]{8})$/;

export const tagLine = (key: string, hash: string) => `${TAG}:${key}:${hash}`;

/** Our key and hash from the last line of a description; null for an entry that is not ours. */
export function parseTag(description: string | null): { key: string; hash: string } | null {
  const last = (description ?? '').trimEnd().split('\n').pop() ?? '';
  const match = TAG_LINE.exec(last.trim());
  return match ? { key: match[1]!, hash: match[2]! } : null;
}

/** FNV-1a, 8 hex digits: enough to tell "changed" from "same" for a few hundred entries. */
export function hash(parts: readonly unknown[]): string {
  let h = 0x811c9dc5;
  for (const char of JSON.stringify(parts)) {
    h ^= char.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** What should be in the calendar: every training and event of the agenda that is not cancelled (a paused one is not in it). */
export function desiredEntries(agenda: readonly AgendaItem[], texts: Texts, reminder: number): Entry[] {
  const alerts = reminder > 0 ? [-reminder] : [];
  return agenda
    .filter((item) => !item.cancelled)
    .map((item) => {
      const start = new Date(item.start).getTime();
      const end = new Date(item.end).getTime();
      const title = `${item.name || texts.kind[item.kind]} · ${item.team_name}`;
      const note = texts.note(item.team_name);
      const key = `event:${item.id}`;
      const h = hash([title, item.location, note, alerts, start, end]);
      return { key, hash: h, title, location: item.location, description: `${note}\n${tagLine(key, h)}`, start, end, alerts };
    });
}

export type Plan = {
  /** Ids of entries to delete. */
  remove: string[];
  create: Entry[];
};

/** The difference between what should be there and what is. Entries without our tag are not ours and stay. */
export function plan(desired: readonly Entry[], existing: readonly Instance[]): Plan {
  const found = new Map<string, { id: string; hash: string }[]>();
  for (const instance of existing) {
    const tag = parseTag(instance.description);
    if (tag) found.set(tag.key, [...(found.get(tag.key) ?? []), { id: instance.id, hash: tag.hash }]);
  }

  const remove: string[] = [];
  const create: Entry[] = [];
  const wanted = new Map(desired.map((entry) => [entry.key, entry]));

  for (const [key, entries] of found) {
    const entry = wanted.get(key);
    let kept = false;
    for (const { id, hash: h } of entries) {
      if (entry && h === entry.hash && !kept) kept = true; // the first one that is right stays
      else remove.push(id); // not wanted, changed, or a duplicate
    }
    if (entry && !kept) create.push(entry);
  }
  for (const entry of desired) if (!found.has(entry.key)) create.push(entry);
  return { remove, create };
}

/** The phone's calendar, as the sync needs it. */
export interface CalendarBackend {
  listInstances(calendarId: string, window: Window): Promise<Instance[]>;
  create(calendarId: string, entry: Entry): Promise<void>;
  remove(id: string): Promise<void>;
}

export type SyncInput = {
  agenda: readonly AgendaItem[];
  texts: Texts;
  window: Window;
  /** Minutes before the start; 0 for none. */
  reminder: number;
};

/** Bring the calendar in line with the schedule. Throws when the phone's calendar does; run again to finish. */
export async function syncCalendar(backend: CalendarBackend, calendarId: string, input: SyncInput): Promise<void> {
  const desired = desiredEntries(input.agenda, input.texts, input.reminder);
  const { remove, create } = plan(desired, await backend.listInstances(calendarId, input.window));
  for (const id of remove) await backend.remove(id);
  for (const entry of create) await backend.create(calendarId, entry);
}
