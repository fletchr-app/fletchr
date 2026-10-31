import assert from 'node:assert/strict';
import { test } from 'vitest';

import { type CalendarBackend, type Entry, type Instance, type SyncInput, type Texts, desiredEntries, hash, parseTag, plan, syncCalendar, tagLine } from './device-calendar.ts';
import type { AgendaItem } from './schedule.ts';

// Instants are read on the device's clock; 25 October 2026 is the end of summer time.
process.env.TZ = 'Europe/Berlin';

const texts: Texts = {
  kind: { training: 'Training', competition: 'Competition', camp: 'Camp' },
  note: (team) => `Training of ${team}, from the Fletchr app`,
};
const window = { from: new Date('2026-10-20T10:00:00Z').getTime(), to: new Date('2026-11-17T10:00:00Z').getTime() };

const item = (id: string, start: string, end: string, extra: Partial<AgendaItem> = {}): AgendaItem => ({
  id, virtual: true, slot: 's1', date: start.slice(0, 10), team: 1, team_name: 'Team A', kind: 'training', name: '', start, end, location: 'Hall', time_zone: 'Europe/Berlin', cancelled: false, ...extra,
});

// Tuesdays 18:00 local: 16:00Z in summer time, 17:00Z after 25 October
const tue = (id: string, day: string, utcHour: number, extra: Partial<AgendaItem> = {}) => item(id, `${day}T${utcHour}:00:00Z`, `${day}T${utcHour + 1}:30:00Z`, extra);
const week = [tue('a', '2026-10-20', 16), tue('b', '2026-10-27', 17), tue('c', '2026-11-03', 17), tue('d', '2026-11-10', 17)];

const stored = (entry: Entry, id = `id-${entry.key}`): Instance => ({ id, startDate: entry.start, description: entry.description });

test('parseTag finds our line at the end and nothing else', () => {
  const tag = tagLine('event:abc-1', '0123abcd');
  assert.deepEqual(parseTag(`Training of A\n${tag}`), { key: 'event:abc-1', hash: '0123abcd' });
  assert.deepEqual(parseTag(`${tag}\n`), { key: 'event:abc-1', hash: '0123abcd' });
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

test('every training and event that is not cancelled becomes one entry', () => {
  const agenda = [
    ...week,
    item('cup', '2026-11-07T08:00:00Z', '2026-11-08T14:00:00Z', { virtual: false, slot: null, date: null, kind: 'competition', name: 'Club cup', location: 'Arena' }),
    tue('off', '2026-11-17', 17, { virtual: false, cancelled: true }),
  ];
  const entries = desiredEntries(agenda, texts, 60);
  assert.deepEqual(entries.map((e) => e.key), ['event:a', 'event:b', 'event:c', 'event:d', 'event:cup']);
  const [first] = entries;
  assert.equal(first!.title, 'Training · Team A');
  assert.equal(first!.location, 'Hall');
  assert.equal(first!.start, new Date('2026-10-20T16:00:00Z').getTime());
  assert.equal(first!.end, new Date('2026-10-20T17:30:00Z').getTime());
  assert.equal(parseTag(first!.description)?.hash, first!.hash);
  assert.ok(first!.description.startsWith('Training of Team A, from the Fletchr app\n'));
  const cup = entries[4]!;
  assert.equal(cup.title, 'Club cup · Team A');
  assert.equal(cup.location, 'Arena');
  assert.deepEqual(cup.alerts, [-60]);
  assert.deepEqual(first!.alerts, [-60]);
  assert.deepEqual(desiredEntries(week, texts, 0)[0]!.alerts, []);
});

test('a training keeps its local time across the time change', () => {
  const [before, after] = desiredEntries(week, texts, 0).slice(0, 2).map((e) => new Date(e.start).getHours());
  assert.equal(before, 18);
  assert.equal(after, 18);
});

test('the hash follows what is written', () => {
  const base = desiredEntries(week, texts, 0)[0]!;
  const changed = (extra: Partial<AgendaItem>, reminder = 0, t = texts) => desiredEntries([{ ...week[0]!, ...extra }], t, reminder)[0]!.hash;
  assert.equal(base.hash, changed({}));
  assert.notEqual(base.hash, changed({ location: 'Field' }));
  assert.notEqual(base.hash, changed({ name: 'Juniors' }));
  assert.notEqual(base.hash, changed({ team_name: 'Team B' }));
  assert.notEqual(base.hash, changed({ start: '2026-10-20T17:00:00Z' }));
  assert.notEqual(base.hash, changed({ end: '2026-10-20T18:00:00Z' }));
  assert.notEqual(base.hash, changed({}, 30));
  assert.notEqual(base.hash, changed({}, 0, { ...texts, note: (t) => `Training von ${t}` }));
});

test('plan: an empty phone gets everything, a phone in step gets nothing, twice', () => {
  const desired = desiredEntries(week, texts, 0);
  assert.deepEqual(plan(desired, []), { remove: [], create: desired });
  const existing = desired.map((e) => stored(e));
  assert.deepEqual(plan(desired, existing), { remove: [], create: [] });
  assert.deepEqual(plan(desired, existing), { remove: [], create: [] });
});

test('plan: a cancelled, moved or paused training goes, the others stay', () => {
  const desired = desiredEntries(week, texts, 0);
  const existing = desired.map((e) => stored(e));
  // cancelled: no longer in the agenda as wanted
  assert.deepEqual(plan(desired.filter((e) => e.key !== 'event:b'), existing), { remove: ['id-event:b'], create: [] });
  // moved: same key, other times
  const moved = desiredEntries([week[0]!, { ...week[1]!, start: '2026-10-27T18:00:00Z', end: '2026-10-27T19:00:00Z' }, week[2]!, week[3]!], texts, 0);
  const result = plan(moved, existing);
  assert.deepEqual(result.remove, ['id-event:b']);
  assert.deepEqual(result.create.map((e) => e.key), ['event:b']);
});

test('plan: a changed hash is removed and created again, an unknown key is removed', () => {
  const [old] = desiredEntries(week, texts, 0);
  const [changed] = desiredEntries(week.map((i) => ({ ...i, location: 'Field' })), texts, 0);
  assert.deepEqual(plan([changed!], [stored(old!, 'x1')]), { remove: ['x1'], create: [changed] });
  assert.deepEqual(plan([], [stored(old!, 'x1')]), { remove: ['x1'], create: [] });
});

test('plan: duplicates of one key keep one', () => {
  const [e] = desiredEntries(week, texts, 0);
  assert.deepEqual(plan([e!], [stored(e!, 'x1'), stored(e!, 'x2'), stored(e!, 'x3')]), { remove: ['x2', 'x3'], create: [] });
  const [changed] = desiredEntries(week.map((i) => ({ ...i, location: 'Field' })), texts, 0);
  assert.deepEqual(plan([e!], [stored(changed!, 'old'), stored(e!, 'x2')]).remove, ['old']);
});

test('plan: entries without our tag are not touched', () => {
  const stray: Instance = { id: 'x', startDate: 1, description: 'Dentist' };
  assert.deepEqual(plan([], [stray, { ...stray, id: 'y', description: null }]), { remove: [], create: [] });
});

// A phone that applies the calls
function fakeBackend() {
  const events = new Map<string, Entry>();
  let next = 0;
  const calls: string[] = [];
  const backend: CalendarBackend = {
    async listInstances(_calendar, { from, to }) {
      return [...events].filter(([, e]) => e.end > from && e.start < to).map(([id, e]) => ({ id, startDate: e.start, description: e.description }));
    },
    async create(_calendar, entry) {
      calls.push(`create ${entry.key}`);
      events.set(`e${next++}`, entry);
    },
    async remove(id) {
      calls.push(`remove ${id}`);
      events.delete(id);
    },
  };
  return { backend, calls, events };
}

const input = (agenda: AgendaItem[]): SyncInput => ({ agenda, texts, window, reminder: 0 });

test('syncCalendar: first run creates, second run changes nothing', async () => {
  const phone = fakeBackend();
  await syncCalendar(phone.backend, 'cal', input(week));
  assert.equal(phone.calls.length, 4);
  phone.calls.length = 0;
  await syncCalendar(phone.backend, 'cal', input(week));
  assert.deepEqual(phone.calls, []);
});

test('syncCalendar: a cancelled training disappears, the next run leaves it alone', async () => {
  const phone = fakeBackend();
  await syncCalendar(phone.backend, 'cal', input(week));
  phone.calls.length = 0;
  const cancelled = [week[0]!, { ...week[1]!, virtual: false, cancelled: true }, week[2]!, week[3]!];
  await syncCalendar(phone.backend, 'cal', input(cancelled));
  assert.equal(phone.calls.length, 1);
  assert.ok(phone.calls[0]!.startsWith('remove'));
  assert.equal(phone.events.size, 3);
  phone.calls.length = 0;
  await syncCalendar(phone.backend, 'cal', input(cancelled));
  assert.deepEqual(phone.calls, []);
});

test('syncCalendar: running again after a crash does not duplicate', async () => {
  const phone = fakeBackend();
  let created = 0;
  const crashing: CalendarBackend = {
    ...phone.backend,
    create: async (calendar, entry) => {
      if (created++ === 2) throw new Error('provider gone');
      await phone.backend.create(calendar, entry);
    },
  };
  await assert.rejects(syncCalendar(crashing, 'cal', input(week)));
  assert.equal(phone.events.size, 2);
  await syncCalendar(phone.backend, 'cal', input(week));
  assert.equal(phone.events.size, 4);
});

test('syncCalendar: entries outside the window are left as they were', async () => {
  const phone = fakeBackend();
  const old = desiredEntries([tue('old', '2026-09-01', 16)], texts, 0)[0]!;
  phone.events.set('past', old);
  await syncCalendar(phone.backend, 'cal', input(week));
  assert.ok(phone.events.has('past'));
});
