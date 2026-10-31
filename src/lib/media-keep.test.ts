import assert from 'node:assert/strict';
import { test } from 'vitest';

import { EMPTY_KEPT, evictions, type KeptState, keptBytes, reduceKept } from './media-keep.ts';

const MB = 1024 * 1024;
const kept = (...items: [string, number, string][]): KeptState =>
  items.reduce((s, [id, mb, at]) => reduceKept(s, { type: 'kept', id, size: mb * MB, at }), EMPTY_KEPT);

test('a kept item is counted once, and opening it makes it the newest', () => {
  let s = kept(['a', 10, '2026-10-01T10:00:00Z'], ['b', 20, '2026-10-02T10:00:00Z']);
  s = reduceKept(s, { type: 'kept', id: 'a', size: 12 * MB, at: '2026-10-03T10:00:00Z' });
  assert.equal(s.items.length, 2);
  assert.equal(keptBytes(s), 32 * MB);
  s = reduceKept(s, { type: 'used', id: 'b', at: '2026-10-04T10:00:00Z' });
  assert.equal(s.items.find((i) => i.id === 'b')?.usedAt, '2026-10-04T10:00:00Z');
  assert.equal(reduceKept(s, { type: 'used', id: 'ghost', at: 't' }), s);
});

test('forgotten items leave, unknown ones change nothing, clear empties', () => {
  const s = kept(['a', 1, 't1'], ['b', 1, 't2']);
  assert.deepEqual(reduceKept(s, { type: 'forget', ids: ['a', 'x'] }).items.map((i) => i.id), ['b']);
  assert.equal(reduceKept(s, { type: 'forget', ids: ['x'] }), s);
  assert.deepEqual(reduceKept(s, { type: 'clear' }), EMPTY_KEPT);
});

test('over the cap the least recently used go first, only as many as needed', () => {
  let s = kept(['a', 400, '2026-10-01T10:00:00Z'], ['b', 400, '2026-10-02T10:00:00Z'], ['c', 400, '2026-10-03T10:00:00Z']);
  assert.deepEqual(evictions(s, 1000), ['a']);
  s = reduceKept(s, { type: 'used', id: 'a', at: '2026-10-04T10:00:00Z' });
  assert.deepEqual(evictions(s, 1000), ['b']);
  assert.deepEqual(evictions(s, 500), ['b', 'c']);
});

test('no limit keeps everything, a limit of 0 drops everything, an open item stays', () => {
  const s = kept(['a', 400, '2026-10-01T10:00:00Z'], ['b', 400, '2026-10-02T10:00:00Z']);
  assert.deepEqual(evictions(s, null), []);
  assert.deepEqual(evictions(s, 0), ['a', 'b']);
  assert.deepEqual(evictions(s, 0, new Set(['a'])), ['b']);
  assert.deepEqual(evictions(s, 1000), []);
});
