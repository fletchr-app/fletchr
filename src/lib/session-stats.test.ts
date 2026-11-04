import assert from 'node:assert/strict';
import { test } from 'vitest';

import type { LogEnd, LogShot } from './log-model.ts';
import { distributionOf, endFigures, figuresOf, halves } from './session-stats.ts';

const shot = (value: number | null, extra: Partial<LogShot> = {}): LogShot => ({ id: `s${Math.random()}`, value, is_x: false, is_miss: false, ...extra });
const end = (index: number, shots: LogShot[]): LogEnd => ({ id: `e${index}`, index, distance_m: '18', face: 'wa-40', arrows_per_end: shots.length, shots });
const session = (ends: LogEnd[]) => ({ ends });

test('the figures of a session', () => {
  const s = session([end(0, [shot(10, { is_x: true }), shot(9), shot(0, { is_miss: true })]), end(1, [shot(10), shot(8), shot(7)])]);
  const f = figuresOf(s);
  assert.equal(f.arrows, 6);
  assert.equal(f.score, 44);
  assert.equal(f.perEnd, 22);
  assert.equal(f.bestValue, 10);
  assert.equal(f.best, 2);
  assert.equal(f.xs, 1);
  assert.equal(f.misses, 1);
  assert.ok(Math.abs(f.average - 44 / 6) < 1e-9);
});

test('an empty session has zeros, not NaN', () => {
  const f = figuresOf(session([]));
  assert.deepEqual([f.arrows, f.score, f.average, f.perEnd, f.best, f.xs, f.misses], [0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(distributionOf(session([])), [{ value: 0, count: 0 }]);
});

test('each end has its total and average', () => {
  const figures = endFigures(session([end(0, [shot(10), shot(8)]), end(1, [shot(5), shot(5)])]));
  assert.deepEqual(figures.map((e) => [e.total, e.average]), [[18, 9], [10, 5]]);
});

test('the distribution runs from the best value down to the miss and counts misses as 0', () => {
  const s = session([end(0, [shot(10, { is_x: true }), shot(10), shot(8), shot(null, { is_miss: true })])]);
  const d = distributionOf(s);
  assert.deepEqual(d.map((x) => x.value), [10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0]);
  assert.deepEqual([d[0]!.count, d[2]!.count, d[10]!.count], [2, 1, 1]);
});

test('halves compare the first and the last ends, and need four ends', () => {
  const e = (i: number, v: number) => end(i, [shot(v), shot(v)]);
  assert.equal(halves(session([e(0, 9), e(1, 9), e(2, 9)])), null);
  assert.deepEqual(halves(session([e(0, 9), e(1, 9), e(2, 7), e(3, 7)])), { first: 9, second: 7 });
  // Five ends: the middle one is in neither half.
  assert.deepEqual(halves(session([e(0, 10), e(1, 10), e(2, 1), e(3, 6), e(4, 6)])), { first: 10, second: 6 });
});
