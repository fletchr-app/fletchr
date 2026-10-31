import assert from 'node:assert/strict';
import { test } from 'vitest';

import type { components } from './api-types.ts';
import {
  type CalendarBackend,
  type Entry,
  type Instance,
  type SyncInput,
  type Texts,
  desiredEntries,
  hash,
  occurrencesToRemove,
  parseTag,
  plan,
  syncCalendar,
  tagLine,
} from './device-calendar.ts';
import type { AgendaItem } from './schedule.ts';

// Instants are read on the device's clock; 25 October 2026 is the end of summer time.
process.env.TZ = 'Europe/Berlin';

type Slot = components['schemas']['Slot'];

const texts: Texts = {
  training: 'Training',
  kind: { training: 'Training', competition: 'Competition', camp: 'Camp' },
  note: (team) => `Training of ${team}, from the Fletchr app`,
};
const teamNames = new Map([[1, 'Team A']]);
const window = { from: new Date('2026-10-20T10:00:00Z').getTime(), to: new Date('2026-11-17T10:00:00Z').getTime() };

const slot = (extra: Partial<Slot> = {}): Slot =>
  ({ id: 's1', team: 1, weekday: 1, start_time: '18:00', end_time: '19:30', time_zone: 'Europe/Berlin', location: 'Hall', name: '', valid_from: '2026-01-01', valid_until: null, ...extra }) as Slot;

const item = (start: string, end: string, extra: Partial<AgendaItem> = {}): AgendaItem => ({
  id: `i-${start}`, virtual: true, slot: 's1', date: start.slice(0, 10), team: 1, team_name: 'Team A', kind: 'training', name: '', start, end, location: 'Hall', time_zone: 'Europe/Berlin', cancelled: false, ...extra,
});

// Tuesdays 18:00 local: 16:00Z in summer time, 17:00Z after 25 October
const tue = (day: string, utcHour: number, extra: Partial<AgendaItem> = {}) => item(`${day}T${utcHour}:00:00Z`, `${day}T${utcHour + 1}:30:00Z`, extra);
const week = [tue('2026-10-20', 16), tue('2026-10-27', 17), tue('2026-11-03', 17), tue('2026-11-10', 17)];

const instance = (entry: Entry, startDate: number, masterId: string | null = null, id = `${entry.key}-${startDate}`): Instance => ({ id, masterId, startDate, description: entry.description });

test('parseTag finds our line at the end and nothing else', () => {
  const tag = tagLine('slot:abc-1', '0123abcd');
  assert.deepEqual(parseTag(`Training of A\n${tag}`), { key: 'slot:abc-1', hash: '0123abcd' });
  assert.deepEqual(parseTag(`${tag}\n`), { key: 'slot:abc-1', hash: '0123abcd' });
  assert.equal(parseTag(`${tag}\nmore text`), null);
  assert.equal(parseTag('just a note'), null);
  assert.equal(parseTag(null), null);
  assert.equal(parseTag('fletchr:other:0123abcd'), null);
});

test('hash is short, stable and tells inputs apart', () => {
  assert.match(hash(['a', 1]), /^[0-9a-f]{8}$/);
  assert.equal(hash(['a', 1]), hash(['a', 1]));
  assert.notEqual(hash(['a', 1]), hash(['a', 2]));
});

test('a slot becomes one series that starts at its first unchanged occurrence', () => {
  const entries = desiredEntries([slot()], week, teamNames, texts, window, 0);
  assert.equal(entries.length, 1);
  const [e] = entries;
  assert.equal(e!.key, 'slot:s1');
  assert.equal(e!.title, 'Training · Team A');
  assert.equal(e!.start, new Date('2026-10-20T16:00:00Z').getTime());
  assert.equal(e!.end, new Date('2026-10-20T17:30:00Z').getTime());
  assert.deepEqual(e!.recurrence, { weekday: 2, until: undefined });
  assert.deepEqual(e!.alerts, []);
  assert.equal(parseTag(e!.description)?.hash, e!.hash);
});

test('a series ends at the end of valid_until, and one that ended before the window is left out', () => {
  const [e] = desiredEntries([slot({ valid_until: '2026-11-10' })], week, teamNames, texts, window, 0);
  assert.equal(e!.recurrence!.until, new Date(2026, 10, 10, 23, 59, 59).getTime());
  assert.equal(desiredEntries([slot({ valid_until: '2026-10-19' })], week, teamNames, texts, window, 0).length, 0);
});

test('a slot with no unchanged occurrence in the window (paused, all moved) has no series', () => {
  assert.equal(desiredEntries([slot()], [], teamNames, texts, window, 0).length, 0);
  assert.equal(desiredEntries([slot()], [tue('2026-10-20', 16, { virtual: false })], teamNames, texts, window, 0).filter((e) => e.key.startsWith('slot:')).length, 0);
});

test('rows become single entries, cancelled ones do not', () => {
  const agenda = [
    ...week,
    tue('2026-10-27', 17, { id: 'moved', virtual: false, start: '2026-10-27T18:00:00Z', end: '2026-10-27T19:00:00Z' }),
    item('2026-11-07T08:00:00Z', '2026-11-08T14:00:00Z', { id: 'cup', virtual: false, slot: null, date: null, kind: 'competition', name: 'Club cup', location: 'Arena' }),
    tue('2026-11-03', 17, { id: 'off', virtual: false, cancelled: true }),
  ];
  const entries = desiredEntries([slot()], agenda, teamNames, texts, window, 60);
  assert.deepEqual(entries.map((e) => e.key), ['slot:s1', 'event:moved', 'event:cup']);
  const cup = entries[2]!;
  assert.equal(cup.title, 'Club cup · Team A');
  assert.equal(cup.location, 'Arena');
  assert.equal(cup.recurrence, undefined);
  assert.deepEqual(cup.alerts, [-60]);
});

test('the hash follows what is written, not the date the series starts at', () => {
  const a = desiredEntries([slot()], week, teamNames, texts, window, 0)[0]!;
  const later = desiredEntries([slot()], week.slice(1), teamNames, texts, window, 0)[0]!;
  assert.equal(a.hash, later.hash); // same time of day (18:00 in both), the first date moved with the window
  assert.notEqual(a.hash, desiredEntries([slot({ location: 'Field' })], week, teamNames, texts, window, 0)[0]!.hash);
  assert.notEqual(a.hash, desiredEntries([slot({ name: 'Juniors' })], week, teamNames, texts, window, 0)[0]!.hash);
  assert.notEqual(a.hash, desiredEntries([slot({ valid_until: '2026-12-01' })], week, teamNames, texts, window, 0)[0]!.hash);
  assert.notEqual(a.hash, desiredEntries([slot()], week, teamNames, texts, window, 30)[0]!.hash);
  assert.notEqual(a.hash, desiredEntries([slot()], week, teamNames, { ...texts, note: (t) => `Training von ${t}` }, window, 0)[0]!.hash);
  const changed = [tue('2026-10-20', 17), ...week.slice(1)];
  assert.notEqual(a.hash, desiredEntries([slot()], changed, teamNames, texts, window, 0)[0]!.hash); // another time of day
});

test('plan: an empty phone gets everything, a phone in step gets nothing, twice', () => {
  const desired = desiredEntries([slot()], week, teamNames, texts, window, 0);
  assert.deepEqual(plan(desired, []), { remove: [], create: desired });
  const existing = [instance(desired[0]!, desired[0]!.start, 'm1'), instance(desired[0]!, desired[0]!.start + 7 * 86_400_000, 'm1')];
  assert.deepEqual(plan(desired, existing), { remove: [], create: [] });
  assert.deepEqual(plan(desired, existing), { remove: [], create: [] });
});

test('plan: a changed entry is removed and created again, a dropped one is removed', () => {
  const [old] = desiredEntries([slot()], week, teamNames, texts, window, 0);
  const [changed] = desiredEntries([slot({ location: 'Field' })], week, teamNames, texts, window, 0);
  assert.deepEqual(plan([changed!], [instance(old!, old!.start, 'm1')]), { remove: ['m1'], create: [changed] });
  assert.deepEqual(plan([], [instance(old!, old!.start, 'm1')]), { remove: ['m1'], create: [] });
});

test('plan: duplicates of one key keep one, a one-off is removed by its own id', () => {
  const [e] = desiredEntries([slot()], week, teamNames, texts, window, 0);
  assert.deepEqual(plan([e!], [instance(e!, 1, 'm1'), instance(e!, 2, 'm2')]), { remove: ['m2'], create: [] });
  const [, moved] = desiredEntries([slot()], [...week, tue('2026-10-27', 17, { id: 'moved', virtual: false })], teamNames, texts, window, 0);
  assert.deepEqual(plan([], [instance(moved!, 5, null, 'ev9')]), { remove: ['ev9'], create: [] });
});

test('plan: entries without our tag are not touched', () => {
  const stray: Instance = { id: 'x', masterId: null, startDate: 1, description: 'Dentist' };
  assert.deepEqual(plan([], [stray, { ...stray, id: 'y', description: null }]), { remove: [], create: [] });
});

test('occurrencesToRemove: cancelled, moved and paused days go, unchanged ones stay', () => {
  const [e] = desiredEntries([slot()], week, teamNames, texts, window, 0);
  const at = (iso: string) => instance(e!, new Date(iso).getTime(), 'm1');
  const agenda = [tue('2026-10-20', 16), tue('2026-11-03', 17), tue('2026-10-27', 17, { virtual: false, cancelled: true })];
  const gone = occurrencesToRemove([at('2026-10-20T16:00:00Z'), at('2026-10-27T17:00:00Z'), at('2026-11-03T17:00:00Z'), at('2026-11-10T17:00:00Z')], agenda);
  assert.deepEqual(gone.map((i) => new Date(i.startDate).toISOString()), ['2026-10-27T17:00:00.000Z', '2026-11-10T17:00:00.000Z']);
});

test('occurrencesToRemove: the day is the device-local day, also across the time change', () => {
  const [e] = desiredEntries([slot()], week, teamNames, texts, window, 0);
  // 18:00 on 27 October is 17:00Z; the series keeps 18:00 local, and so does the agenda
  const kept = occurrencesToRemove([instance(e!, new Date('2026-10-27T17:00:00Z').getTime(), 'm1')], week);
  assert.equal(kept.length, 0);
  assert.equal(occurrencesToRemove([{ id: 'o', masterId: null, startDate: 0, description: 'Dentist' }], []).length, 0);
});

// A phone that applies the calls and lists a weekly series as its instances
function fakeBackend() {
  const events = new Map<string, { entry: Entry; removed: Set<number> }>();
  let next = 0;
  const calls: string[] = [];
  const backend: CalendarBackend = {
    async listInstances(_calendar, { from, to }) {
      const out: Instance[] = [];
      for (const [id, { entry, removed }] of events) {
        // A weekly series keeps its local time across the time change
        const times = entry.recurrence ? Array.from({ length: 6 }, (_, n) => new Date(entry.start).setDate(new Date(entry.start).getDate() + 7 * n)) : [entry.start];
        for (const startDate of times) {
          if (startDate >= from && startDate < to && !removed.has(startDate)) out.push({ id: `${id}/${startDate}`, masterId: entry.recurrence ? id : null, startDate, description: entry.description });
        }
      }
      return out;
    },
    async create(_calendar, entry) {
      calls.push(`create ${entry.key}`);
      events.set(`e${next++}`, { entry, removed: new Set() });
    },
    async remove(id) {
      calls.push(`remove ${id}`);
      events.delete(id.split('/')[0]!);
    },
    async removeOccurrence(masterId, instanceDate) {
      calls.push(`occurrence ${masterId}`);
      events.get(masterId)!.removed.add(instanceDate);
    },
  };
  return { backend, calls, events };
}

const input = (agenda: AgendaItem[], slots = [slot()]): SyncInput => ({ slots, agenda, teamNames, texts, window, reminder: 0 });

test('syncCalendar: first run creates, second run changes nothing', async () => {
  const phone = fakeBackend();
  await syncCalendar(phone.backend, 'cal', input(week));
  assert.deepEqual(phone.calls, ['create slot:s1']);
  phone.calls.length = 0;
  await syncCalendar(phone.backend, 'cal', input(week));
  assert.deepEqual(phone.calls, []);
});

test('syncCalendar: a cancelled occurrence comes out of the series and the next run leaves it alone', async () => {
  const phone = fakeBackend();
  await syncCalendar(phone.backend, 'cal', input(week));
  phone.calls.length = 0;
  const cancelled = [week[0]!, tue('2026-10-27', 17, { virtual: false, cancelled: true }), week[2]!];
  await syncCalendar(phone.backend, 'cal', input(cancelled));
  assert.deepEqual(phone.calls.filter((c) => !c.startsWith('occurrence')), []);
  assert.ok(phone.calls.some((c) => c.startsWith('occurrence')));
  phone.calls.length = 0;
  await syncCalendar(phone.backend, 'cal', input(cancelled));
  assert.deepEqual(phone.calls, []);
});

test('syncCalendar: finishing after a crash does not duplicate', async () => {
  const phone = fakeBackend();
  const crashing = { ...phone.backend, removeOccurrence: async () => { throw new Error('provider gone'); } };
  const cancelled = [week[0]!, tue('2026-10-27', 17, { virtual: false, cancelled: true }), week[2]!];
  await assert.rejects(syncCalendar(crashing, 'cal', input(cancelled)));
  await syncCalendar(phone.backend, 'cal', input(cancelled));
  assert.equal(phone.events.size, 1);
});
