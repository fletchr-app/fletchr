import assert from 'node:assert/strict';
import { test } from 'vitest';

import { byRating, comparable } from './rating-stats.ts';

const s = (average: number, arrows: number, physical?: number | null, mental?: number | null) => ({ average, arrows, physical_rating: physical, mental_rating: mental });

test('sessions with the same rating are averaged, every arrow counting the same', () => {
  const bars = byRating([s(8, 30, 4), s(9, 10, 4), s(7, 20, 2)], 'physical_rating');
  assert.deepEqual(bars.map((b) => [b.rating, b.sessions, b.arrows]), [[2, 1, 20], [4, 2, 40]]);
  assert.equal(bars[0]!.average, 7);
  assert.equal(bars[1]!.average, (8 * 30 + 9 * 10) / 40);
});

test('physical and mental are separate, and sessions without the rating are left out', () => {
  const list = [s(8, 10, 5, 1), s(9, 10, null, 5), s(7, 10, 3, undefined)];
  assert.deepEqual(byRating(list, 'physical_rating').map((b) => b.rating), [3, 5]);
  assert.deepEqual(byRating(list, 'mental_rating').map((b) => b.rating), [1, 5]);
});

test('nothing rated, nothing to show; one rating is nothing to compare', () => {
  assert.deepEqual(byRating([s(8, 10)], 'physical_rating'), []);
  assert.equal(comparable(byRating([s(8, 10, 4), s(9, 10, 4)], 'physical_rating')), false);
  assert.equal(comparable(byRating([s(8, 10, 4), s(9, 10, 5)], 'physical_rating')), true);
});

test('a rating outside the scale is ignored', () => {
  assert.deepEqual(byRating([s(8, 10, 6), s(8, 10, 0)], 'physical_rating'), []);
});
