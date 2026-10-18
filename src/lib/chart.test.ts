import assert from 'node:assert/strict';
import { test } from 'vitest';

import { columnPath, compact, niceTicks, scoreDomain } from './chart.ts';

test('ticks are round numbers that reach the data', () => {
  assert.deepEqual(niceTicks(148), { max: 150, ticks: [0, 50, 100, 150] });
  assert.deepEqual(niceTicks(7), { max: 8, ticks: [0, 2, 4, 6, 8] });
  assert.deepEqual(niceTicks(1000), { max: 1000, ticks: [0, 500, 1000] });
  assert.deepEqual(niceTicks(0), { max: 1, ticks: [0, 1] });
  assert.deepEqual(niceTicks(3), { max: 3, ticks: [0, 1, 2, 3] });
});

test('the top tick is never below the largest value', () => {
  for (const max of [1, 2, 9, 37, 148, 999, 1234, 56789]) {
    const { max: top, ticks } = niceTicks(max);
    assert.ok(top >= max, `${max} -> ${top}`);
    assert.equal(ticks[0], 0);
    assert.equal(ticks[ticks.length - 1], top);
  }
});

test('compact numbers for axes', () => {
  assert.deepEqual([0, 7, 950, 999].map(compact), ['0', '7', '950', '999']);
  assert.deepEqual([1000, 1234, 12500, 100000].map(compact), ['1K', '1.2K', '12.5K', '100K']);
});

test('the score range hugs the data but stays within 0 and the best ring', () => {
  assert.deepEqual(scoreDomain([8.2, 8.9], 10), { lo: 7, hi: 10, ticks: [7, 8, 9, 10] });
  assert.deepEqual(scoreDomain([3.1], 10), { lo: 2, hi: 4, ticks: [2, 3, 4] });
  assert.deepEqual(scoreDomain([9.5, 9.9], 10), { lo: 8, hi: 10, ticks: [8, 9, 10] });
  assert.deepEqual(scoreDomain([0.2], 10), { lo: 0, hi: 2, ticks: [0, 1, 2] });
  assert.deepEqual(scoreDomain([4.5, 5.9], 6), { lo: 4, hi: 6, ticks: [4, 5, 6] }, 'a field face tops out at 6');
  const wide = scoreDomain([1.5, 9.5], 10);
  assert.deepEqual([wide.lo, wide.hi, wide.ticks], [1, 10, [1, 3, 5, 7, 9]]);
});

test('a column grows up from its baseline with a rounded top only', () => {
  const path = columnPath(10, 100, 20, 50);
  assert.ok(path.startsWith('M10,100 L10,54'), 'square at the foot, then up to where the corner starts');
  assert.ok(path.includes('Q10,50 14,50'), 'rounded top left corner');
  assert.ok(path.includes('L30,100'), 'square foot on the right');
  const short = columnPath(0, 100, 20, 2);
  assert.ok(short.startsWith('M0,100 L0,100'), 'the corner radius shrinks for a very short column');
});
