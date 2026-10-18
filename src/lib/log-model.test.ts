import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  EMPTY_LOG,
  endTotal,
  keypadFor,
  nextEndDefaults,
  reduce,
  sessionTotals,
  shotLabel,
  type LogAction,
  type LogEnd,
  type LogSession,
  type LogState,
} from './log-model.ts';

const session = (id = 's1'): LogSession => ({
  id, started_at: '2026-10-18T09:00:00Z', ended_at: null, type: 'scoring', environment: 'indoor', location: '', ends: [], volume: [],
});
const shot = (id: string, value: number | null, extra = {}) => ({ id, value, is_x: false, is_miss: false, ...extra });
const end = (id: string, index: number, shots = [shot('a', 10), shot('b', 9)]): LogEnd => ({
  id, index, distance_m: '18', face: 'wa-40', arrows_per_end: 3, shots,
});
const run = (...actions: LogAction[]): LogState => actions.reduce(reduce, EMPTY_LOG);
const keys = (s: LogState) => s.outbox.map((o) => `${o.kind}${o.delete ? '-delete' : ''}`);

test('starting a session queues its upload', () => {
  const s = run({ type: 'startSession', session: session() });
  assert.equal(s.sessions.length, 1);
  assert.deepEqual(keys(s), ['session']);
});

test('saving an end queues it after the session, and saving again does not queue a second upload', () => {
  const s = run(
    { type: 'startSession', session: session() },
    { type: 'saveEnd', sessionId: 's1', end: end('e1', 0) },
    { type: 'saveEnd', sessionId: 's1', end: end('e1', 0, [shot('a', 10)]) },
  );
  assert.deepEqual(keys(s), ['session', 'end']);
  assert.equal(s.sessions[0].ends.length, 1);
  assert.equal(s.sessions[0].ends[0].shots.length, 1);
});

test('ends are kept in index order', () => {
  const s = run(
    { type: 'startSession', session: session() },
    { type: 'saveEnd', sessionId: 's1', end: end('e2', 1) },
    { type: 'saveEnd', sessionId: 's1', end: end('e1', 0) },
  );
  assert.deepEqual(s.sessions[0].ends.map((e) => e.id), ['e1', 'e2']);
});

test('editing the session while it waits keeps its place in front of the ends', () => {
  const s = run(
    { type: 'startSession', session: session() },
    { type: 'saveEnd', sessionId: 's1', end: end('e1', 0) },
    { type: 'updateSession', id: 's1', patch: { ended_at: '2026-10-18T11:00:00Z' } },
  );
  assert.deepEqual(keys(s), ['session', 'end']);
  assert.equal(s.sessions[0].ended_at, '2026-10-18T11:00:00Z');
});

test('a finished upload leaves the queue, but an edit made during it stays', () => {
  let s = run({ type: 'startSession', session: session() }, { type: 'saveEnd', sessionId: 's1', end: end('e1', 0) });
  const sending = s.outbox[1]; // the upload of e1 starts...
  s = reduce(s, { type: 'saveEnd', sessionId: 's1', end: end('e1', 0, [shot('a', 10), shot('b', 9), shot('c', 8)]) }); // ...and e1 is edited
  s = reduce(s, { type: 'opDone', key: sending.key, rev: sending.rev });
  assert.deepEqual(keys(s), ['session', 'end'], 'the newer edit is still queued');
  const latest = s.outbox[1];
  s = reduce(s, { type: 'opDone', key: latest.key, rev: latest.rev });
  assert.deepEqual(keys(s), ['session']);
});

test('deleting an end replaces its upload with a delete', () => {
  const s = run(
    { type: 'startSession', session: session() },
    { type: 'saveEnd', sessionId: 's1', end: end('e1', 0) },
    { type: 'deleteEnd', sessionId: 's1', endId: 'e1' },
  );
  assert.deepEqual(keys(s), ['session', 'end-delete']);
  assert.equal(s.sessions[0].ends.length, 0);
});

test('deleting a session drops its pending uploads and queues one delete', () => {
  const s = run(
    { type: 'startSession', session: session('s1') },
    { type: 'startSession', session: session('s2') },
    { type: 'saveEnd', sessionId: 's1', end: end('e1', 0) },
    { type: 'saveVolume', sessionId: 's1', entry: { id: 'v1', distance_m: '18', arrow_count: 30 } },
    { type: 'deleteSession', id: 's1' },
  );
  assert.deepEqual(s.outbox.map((o) => `${o.sessionId}:${o.kind}${o.delete ? '-delete' : ''}`), ['s2:session', 's1:session-delete']);
  assert.deepEqual(s.sessions.map((x) => x.id), ['s2']);
});

test('failed uploads are skipped until retried, and can be discarded', () => {
  let s = run({ type: 'startSession', session: session() });
  s = reduce(s, { type: 'opFailed', key: s.outbox[0].key, rev: s.outbox[0].rev, error: 'Not allowed' });
  assert.equal(s.outbox[0].error, 'Not allowed');
  const retried = reduce(s, { type: 'retryFailed' });
  assert.equal(retried.outbox[0].error, undefined);
  assert.equal(reduce(s, { type: 'discardFailed' }).outbox.length, 0);
  assert.equal(reduce(s, { type: 'discardFailed' }).sessions.length, 1, 'the local data stays');
});

test('a late failure for an old version does not mark the newer edit as failed', () => {
  let s = run({ type: 'startSession', session: session() }, { type: 'saveEnd', sessionId: 's1', end: end('e1', 0) });
  const old = s.outbox[1];
  s = reduce(s, { type: 'saveEnd', sessionId: 's1', end: end('e1', 0, []) });
  s = reduce(s, { type: 'opFailed', key: old.key, rev: old.rev, error: 'boom' });
  assert.equal(s.outbox[1].error, undefined);
});

test('totals: X counts 10, a miss counts 0', () => {
  const e = end('e1', 0, [shot('a', 10, { is_x: true }), shot('b', 9), shot('c', null, { is_miss: true })]);
  assert.equal(endTotal(e), 19);
  assert.deepEqual(e.shots.map(shotLabel), ['X', '9', 'M']);
  const s = { ...session(), ends: [e, end('e2', 1)], volume: [{ id: 'v', distance_m: '18', arrow_count: 30 }] };
  assert.deepEqual(sessionTotals(s), { arrows: 3 + 2 + 30, score: 19 + 19 });
});

test('keypad: X only where the face has an X ring, rings best first, then a miss', () => {
  const wa122 = { kind: 'wa', x_diameter_cm: 6.1, rings: [10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((value) => ({ value })) };
  assert.deepEqual(keypadFor(wa122).map((k) => k.label), ['X', '10', '9', '8', '7', '6', '5', '4', '3', '2', '1', 'M']);
  const triple = { kind: 'wa', rings: [10, 9, 8, 7, 6].map((value) => ({ value })) };
  assert.deepEqual(keypadFor(triple).map((k) => k.label), ['10', '9', '8', '7', '6', 'M']);
  assert.deepEqual(keypadFor({ kind: 'blank', rings: [] }), []);
  const x = keypadFor(wa122)[0];
  assert.deepEqual([x.value, x.is_x], [10, true]);
});

test('next end starts like the last one', () => {
  assert.deepEqual(nextEndDefaults(session()), { index: 0, distance_m: '18', face: 'wa-40', arrows_per_end: 3 });
  assert.equal(nextEndDefaults({ ...session(), environment: 'outdoor' }).face, 'wa-122');
  const withEnd = { ...session(), ends: [{ ...end('e1', 4), distance_m: '30', face: 'wa-80', arrows_per_end: 6 }] };
  assert.deepEqual(nextEndDefaults(withEnd), { index: 5, distance_m: '30', face: 'wa-80', arrows_per_end: 6 });
});
