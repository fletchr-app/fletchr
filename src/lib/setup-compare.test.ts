import assert from 'node:assert/strict';
import { test } from 'vitest';

import { bySetup, comparable, type SetupSession } from './setup-compare.ts';

const s = (date: string, setup: number | null, arrows: number, average: number, extra: Partial<SetupSession> = {}): SetupSession => ({
  date, setup, arrows, average, plotted: 0, ...extra,
});

test('one entry per setup, the most recently used first', () => {
  const list = bySetup([s('2026-10-01', 1, 30, 8), s('2026-10-20', 2, 30, 9), s('2026-10-10', 1, 30, 8)]);
  assert.deepEqual(list.map((x) => [x.setup, x.sessions, x.lastDate]), [[2, 1, '2026-10-20'], [1, 2, '2026-10-10']]);
});

test('the average counts every arrow the same', () => {
  const [one] = bySetup([s('2026-10-01', 1, 30, 8), s('2026-10-02', 1, 10, 9)]);
  assert.equal(one!.arrows, 40);
  assert.equal(one!.average, (8 * 30 + 9 * 10) / 40);
});

test('spread and centre are weighed by the plotted arrows, and only sessions with positions take part', () => {
  const [one] = bySetup([
    s('2026-10-01', 1, 30, 8, { plotted: 30, spread: 0.2, centre_x: 0.1, centre_y: -0.1 }),
    s('2026-10-02', 1, 10, 8, { plotted: 10, spread: 0.4, centre_x: 0.3, centre_y: 0.3 }),
    s('2026-10-03', 1, 12, 8), // typed in: no positions
  ]);
  assert.equal(one!.plotted, 40);
  assert.ok(Math.abs(one!.spread! - 0.25) < 1e-9);
  assert.ok(Math.abs(one!.centreX! - 0.15) < 1e-9 && Math.abs(one!.centreY! - 0) < 1e-9);
});

test('sessions without positions have no spread and no centre', () => {
  const [one] = bySetup([s('2026-10-01', 1, 30, 8)]);
  assert.deepEqual([one!.plotted, one!.spread, one!.centreX, one!.centreY], [0, null, null, null]);
});

test('sessions without equipment are one group of their own', () => {
  const list = bySetup([s('2026-10-01', null, 6, 7), s('2026-10-02', undefined as unknown as null, 6, 9), s('2026-10-03', 4, 6, 8)]);
  assert.deepEqual(list.map((x) => [x.setup, x.sessions]), [[4, 1], [null, 2]]);
});

test('a comparison needs two setups', () => {
  assert.equal(comparable(bySetup([s('2026-10-01', 1, 30, 8)])), false);
  assert.equal(comparable(bySetup([s('2026-10-01', 1, 30, 8), s('2026-10-02', 2, 30, 8)])), true);
});
