// The trainings and events of your teams as entries in a calendar the app owns on the phone (#107). No Vue, no Capacitor:
// the phone's calendar holds the whole state (every entry ends with a tag line: our key and a hash of what we wrote), so a
// sync is a diff between what should be there and what is, safe to repeat and safe after a crash halfway.
import type { components } from './api-types.ts';
import { type AgendaItem, type EventKind, dayKey, toLocalInput } from './schedule.ts';

type Slot = components['schemas']['Slot'];

/** The words an entry is made of; the caller translates (`src/lib` builds no sentences). */
export type Texts = {
  /** The title of a slot without a name. */
  training: string;
  kind: Record<EventKind, string>;
  /** The line above the tag, e.g. "Training of <team>, from the Fletchr app". */
  note: (team: string) => string;
};

/** Something to write: a weekly series (`recurrence`) or a single entry. Times are instants in ms. */
export type Entry = {
  /** `slot:<id>` for a series, `event:<id>` for everything else. */
  key: string;
  hash: string;
  title: string;
  location: string;
  description: string;
  start: number;
  end: number;
  /** `weekday` 1 is Monday, 7 Sunday; `until` the end of the last day (ms), or none. */
  recurrence?: { weekday: number; until?: number };
  /** Minutes relative to the start, negative before it. */
  alerts: number[];
};

/** What the phone's calendar returns for our calendar: one row per occurrence. */
export type Instance = { id: string; masterId: string | null; startDate: number; description: string | null };

export type Window = { from: number; to: number };

export const TAG = 'fletchr';
const TAG_LINE = /^fletchr:((?:slot|event):[\w-]+):([0-9a-f]{8})$/;

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

/** The end of a `YYYY-MM-DD` day on the device's clock, in ms. */
const endOfDay = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y!, m! - 1, d!, 23, 59, 59).getTime();
};

/** 1 is Monday, 7 Sunday (the plugin's weekdays) for an instant on the device's clock. */
const weekdayOf = (ms: number) => new Date(ms).getDay() || 7;

const clock = (ms: number) => toLocalInput(new Date(ms).toISOString()).slice(11);

function build(partial: Omit<Entry, 'hash' | 'description'>, note: string, shape: unknown[]): Entry {
  const h = hash([partial.title, partial.location, note, partial.alerts, ...shape]);
  return { ...partial, hash: h, description: `${note}\n${tagLine(partial.key, h)}` };
}

/**
 * What should be in the calendar for the window, from the slots and the agenda of all your teams.
 * A series per slot (from the first occurrence nobody changed, so its times are the server's, DST included), plus one entry per
 * training row that is not cancelled (one-offs, competitions, camps, and occurrences that were moved or got something linked).
 */
export function desiredEntries(
  slots: readonly Slot[],
  agenda: readonly AgendaItem[],
  teamNames: ReadonlyMap<number, string>,
  texts: Texts,
  window: Window,
  reminder: number,
): Entry[] {
  const alerts = reminder > 0 ? [-reminder] : [];
  const windowStart = dayKey(new Date(window.from).toISOString());
  const entries: Entry[] = [];

  for (const slot of slots) {
    if (slot.valid_until && slot.valid_until < windowStart) continue;
    const first = agenda
      .filter((item) => item.virtual && item.slot === slot.id)
      .sort((a, b) => a.start.localeCompare(b.start))[0];
    if (!first) continue; // nothing unchanged in the window (paused, or all moved): nothing to repeat
    const team = teamNames.get(slot.team) ?? first.team_name;
    const start = new Date(first.start).getTime();
    const end = new Date(first.end).getTime();
    const until = slot.valid_until ? endOfDay(slot.valid_until) : undefined;
    const weekday = weekdayOf(start);
    entries.push(
      build(
        {
          key: `slot:${slot.id}`,
          title: `${slot.name || texts.training} · ${team}`,
          location: slot.location ?? '',
          start,
          end,
          recurrence: { weekday, until },
          alerts,
        },
        texts.note(team),
        // The date of the first occurrence moves with the window, so only its time of day counts
        [weekday, clock(start), clock(end), until ?? null],
      ),
    );
  }

  for (const item of agenda) {
    if (item.virtual || item.cancelled) continue;
    const team = teamNames.get(item.team) ?? item.team_name;
    const start = new Date(item.start).getTime();
    const end = new Date(item.end).getTime();
    entries.push(
      build(
        { key: `event:${item.id}`, title: `${item.name || texts.kind[item.kind]} · ${team}`, location: item.location, start, end, alerts },
        texts.note(team),
        [start, end],
      ),
    );
  }
  return entries;
}

export type Plan = {
  /** Events to delete whole (a series with all its occurrences). */
  remove: string[];
  create: Entry[];
};

/** The difference between what should be there and what is. Instances without our tag are not ours and stay. */
export function plan(desired: readonly Entry[], existing: readonly Instance[]): Plan {
  // key -> master id -> hash of the tag on it
  const found = new Map<string, Map<string, string>>();
  for (const instance of existing) {
    const tag = parseTag(instance.description);
    if (!tag) continue;
    const masters = found.get(tag.key) ?? new Map<string, string>();
    masters.set(instance.masterId ?? instance.id, tag.hash);
    found.set(tag.key, masters);
  }

  const remove: string[] = [];
  const create: Entry[] = [];
  const wanted = new Map(desired.map((entry) => [entry.key, entry]));

  for (const [key, masters] of found) {
    const entry = wanted.get(key);
    let kept = false;
    for (const [master, h] of masters) {
      if (entry && h === entry.hash && !kept) kept = true; // the first one that is right stays
      else remove.push(master); // not wanted, changed, or a duplicate
    }
    if (entry && !kept) create.push(entry);
  }
  for (const entry of desired) if (!found.has(entry.key)) create.push(entry);
  return { remove, create };
}

/**
 * The occurrences of our series that should not be there: the agenda has no unchanged occurrence of the slot on that day.
 * That covers a cancelled, moved, paused or deleted training alike, without any date arithmetic of our own.
 */
export function occurrencesToRemove(existing: readonly Instance[], agenda: readonly AgendaItem[]): Instance[] {
  const days = new Set(agenda.filter((item) => item.virtual).map((item) => `${item.slot}|${dayKey(item.start)}`));
  return existing.filter((instance) => {
    const key = parseTag(instance.description)?.key;
    if (!key?.startsWith('slot:')) return false;
    return !days.has(`${key.slice('slot:'.length)}|${dayKey(new Date(instance.startDate).toISOString())}`);
  });
}

/** The phone's calendar, as the sync needs it. */
export interface CalendarBackend {
  listInstances(calendarId: string, window: Window): Promise<Instance[]>;
  create(calendarId: string, entry: Entry): Promise<void>;
  /** The whole event: a one-off, or a series with all occurrences. */
  remove(id: string): Promise<void>;
  removeOccurrence(masterId: string, instanceDate: number): Promise<void>;
}

export type SyncInput = {
  slots: readonly Slot[];
  agenda: readonly AgendaItem[];
  teamNames: ReadonlyMap<number, string>;
  texts: Texts;
  window: Window;
  /** Minutes before the start; 0 for none. */
  reminder: number;
};

/** Bring the calendar in line with the schedule. Throws when the phone's calendar does; run again to finish. */
export async function syncCalendar(backend: CalendarBackend, calendarId: string, input: SyncInput): Promise<void> {
  const desired = desiredEntries(input.slots, input.agenda, input.teamNames, input.texts, input.window, input.reminder);
  const { remove, create } = plan(desired, await backend.listInstances(calendarId, input.window));
  for (const id of remove) await backend.remove(id);
  for (const entry of create) await backend.create(calendarId, entry);
  // A new series has every weekday occurrence; the ones the schedule changed come out of it now that the phone lists them
  for (const instance of occurrencesToRemove(await backend.listInstances(calendarId, input.window), input.agenda)) {
    await backend.removeOccurrence(instance.masterId ?? instance.id, instance.startDate);
  }
}
