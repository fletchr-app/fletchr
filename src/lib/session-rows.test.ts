import assert from 'node:assert/strict';
import { test } from 'vitest';

import type { LogSession } from './log-model.ts';
import { arrowsSince, sessionRows, weekStart } from './session-rows.ts';

const local = (id: string, started_at: string): LogSession => ({
  id, started_at, ended_at: null, type: 'scoring', environment: 'indoor', location: 'Hall', ends: [], volume: [],
});
const remote = (id: string, started_at: string) =>
  ({ id, started_at, ended_at: '2026-10-18T10:00:00Z', type: 'scoring', location: '', ends: 2, scored_arrows: 6, volume_arrows: 0, score_total: 50 }) as never;

test('local and server sessions are merged, newest first, a shared one is shown from the device', () => {
  const rows = sessionRows(
    [local('a', '2026-10-18T09:00:00Z'), local('b', '2026-10-17T09:00:00Z')],
    [remote('b', '2026-10-17T09:00:00Z'), remote('c', '2026-10-19T09:00:00Z')],
  );
  assert.deepEqual(rows.map((r) => [r.id, r.to]), [['c', '/sessions/c'], ['a', '/training/a'], ['b', '/training/b']]);
  assert.equal(rows[0]!.points, 50);
  assert.equal(rows[0]!.finished, true);
});

test('a session deleted on this device is not shown from the server list while that still has it', () => {
  const rows = sessionRows([local('a', '2026-10-18T09:00:00Z')], [remote('b', '2026-10-17T09:00:00Z'), remote('c', '2026-10-19T09:00:00Z')], new Set(['b']));
  assert.deepEqual(rows.map((r) => r.id), ['c', 'a']);
  assert.deepEqual(sessionRows([], [remote('b', '2026-10-17T09:00:00Z')]).map((r) => r.id), ['b']); // nothing deleted: shown as before
});

test('the week starts on Monday, on the device clock', () => {
  assert.deepEqual(weekStart(new Date(2026, 9, 21, 15, 30)), new Date(2026, 9, 19)); // Wednesday
  assert.deepEqual(weekStart(new Date(2026, 9, 25, 23, 59)), new Date(2026, 9, 19)); // Sunday
  assert.deepEqual(weekStart(new Date(2026, 9, 19, 0, 0)), new Date(2026, 9, 19)); // Monday morning
});

test('arrows of this week count the sessions since Monday, scored or not', () => {
  const rows = sessionRows(
    [],
    [
      { ...(remote('a', new Date(2026, 9, 20, 18).toISOString()) as object), scored_arrows: 30, volume_arrows: 0 },
      { ...(remote('b', new Date(2026, 9, 19, 9).toISOString()) as object), scored_arrows: 0, volume_arrows: 20 },
      { ...(remote('c', new Date(2026, 9, 18, 18).toISOString()) as object), scored_arrows: 36, volume_arrows: 0 }, // Sunday before
    ] as never,
  );
  assert.equal(arrowsSince(rows, weekStart(new Date(2026, 9, 21))), 50);
  assert.equal(arrowsSince([], weekStart(new Date())), 0);
});

test('a training with notes or photos of the archer and no session of theirs is a row between the sessions', () => {
  const event = { event: { id: 'ev1', name: 'Squad', kind: 'training', start: '2026-10-18T16:00:00Z', location: 'Hall' }, notes: 2, media: 1 } as never;
  const rows = sessionRows([local('a', '2026-10-18T09:00:00Z'), local('b', '2026-10-17T09:00:00Z')], [], new Set(), [event], 7);
  assert.deepEqual(rows.map((r) => r.id), ['event:ev1', 'a', 'b']);
  assert.equal(rows[0]!.to, '/events/ev1?archer=7');
  assert.deepEqual(rows[0]!.event, { name: 'Squad', kind: 'training', notes: 2, media: 1 });
  assert.equal(sessionRows([], [], new Set(), [event])[0]!.to, '/events/ev1');
});

test('a private session shows as such, from the device or the server; a session nobody chose for follows the default', () => {
  const summary = (id: string, visibility: string) => ({ ...(remote(id, '2026-10-17T09:00:00Z') as object), visibility }) as never;
  const rows = sessionRows(
    [{ ...local('a', '2026-10-18T09:00:00Z'), visibility: 'me' }, local('b', '2026-10-16T09:00:00Z')],
    [summary('c', 'me'), summary('d', 'coaches')],
    new Set(),
    [],
    undefined,
    'me',
  );
  assert.deepEqual(rows.map((r) => [r.id, r.visibility]), [['a', 'me'], ['c', 'me'], ['d', 'coaches'], ['b', 'me']]);
  assert.equal(sessionRows([local('a', '2026-10-18T09:00:00Z')], []).every((r) => r.visibility === undefined), true, 'no lock where the sessions are not the viewer\'s own');
});
