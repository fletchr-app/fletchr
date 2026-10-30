import assert from 'node:assert/strict';
import { test } from 'vitest';

import { type AgendaItem, eventTitle, preselected, suggestEvents } from './schedule.ts';

const item = (id: string, start: string, end: string, extra: Partial<AgendaItem> = {}): AgendaItem => ({
  id, virtual: true, slot: 's', date: '2026-10-21', team: 1, team_name: 'Team A', kind: 'training', name: '', start, end, location: '', time_zone: 'Europe/Berlin', cancelled: false, ...extra,
});
const squad = item('squad', '2026-10-21T16:00:00Z', '2026-10-21T17:30:00Z');

test('a moment is inside a training from its start up to, not including, its end', () => {
  assert.equal(suggestEvents([squad], '2026-10-21T15:59:59Z').length, 0);
  assert.equal(suggestEvents([squad], '2026-10-21T16:00:00Z').length, 1);
  assert.equal(suggestEvents([squad], '2026-10-21T17:29:59Z').length, 1);
  assert.equal(suggestEvents([squad], '2026-10-21T17:30:00Z').length, 0);
});

test('a session with an end is suggested when the two spans overlap, not when they only touch', () => {
  assert.equal(suggestEvents([squad], '2026-10-21T15:00:00Z', '2026-10-21T16:30:00Z').length, 1);
  assert.equal(suggestEvents([squad], '2026-10-21T17:00:00Z', '2026-10-21T18:30:00Z').length, 1);
  assert.equal(suggestEvents([squad], '2026-10-21T15:00:00Z', '2026-10-21T16:00:00Z').length, 0);
  assert.equal(suggestEvents([squad], '2026-10-21T17:30:00Z', '2026-10-21T19:00:00Z').length, 0);
});

test('a cancelled training is not suggested', () => {
  assert.deepEqual(suggestEvents([{ ...squad, cancelled: true }], '2026-10-21T16:30:00Z'), []);
});

test('several teams give several suggestions, sorted by start, and the teams can be limited', () => {
  const other = item('b', '2026-10-21T15:30:00Z', '2026-10-21T17:00:00Z', { team: 2, team_name: 'Team B' });
  assert.deepEqual(suggestEvents([squad, other], '2026-10-21T16:15:00Z').map((i) => i.id), ['b', 'squad']);
  assert.deepEqual(suggestEvents([squad, other], '2026-10-21T16:15:00Z', null, { teams: [1] }).map((i) => i.id), ['squad']);
});

test('a competition session is offered the competitions first', () => {
  const cup = item('cup', '2026-10-21T16:10:00Z', '2026-10-21T20:00:00Z', { kind: 'competition' });
  assert.deepEqual(suggestEvents([squad, cup], '2026-10-21T16:30:00Z').map((i) => i.id), ['squad', 'cup']);
  assert.deepEqual(suggestEvents([squad, cup], '2026-10-21T16:30:00Z', null, { preferKind: 'competition' }).map((i) => i.id), ['cup', 'squad']);
});

test('only exactly one suggestion is preselected', () => {
  assert.equal(preselected([squad])?.id, 'squad');
  assert.equal(preselected([]), null);
  assert.equal(preselected([squad, item('b', '2026-10-21T16:00:00Z', '2026-10-21T17:00:00Z')]), null);
});

test('an event is titled by its name, else by its kind', () => {
  assert.equal(eventTitle({ name: 'Squad', kind: 'training' }), 'Squad');
  assert.equal(eventTitle({ name: '', kind: 'camp' }), 'event.kind.camp');
});
