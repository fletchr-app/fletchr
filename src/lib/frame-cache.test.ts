import assert from 'node:assert/strict';
import { test } from 'vitest';

import { evictions, gopIndex, gopsOf, prefetchTarget } from './frame-cache.ts';

const gops = gopsOf([0, 10, 20, 30], 36); // the last group is short

test('groups run from a keyframe to the frame before the next one', () => {
  assert.deepEqual(gops, [{ start: 0, end: 9 }, { start: 10, end: 19 }, { start: 20, end: 29 }, { start: 30, end: 35 }]);
});

test('each frame is in the group it belongs to', () => {
  const expected = [0, 9, 10, 19, 20, 29, 30, 35];
  assert.deepEqual([0, 9, 10, 19, 20, 29, 30, 35].map((f) => gopIndex(gops, f)), [0, 0, 1, 1, 2, 2, 3, 3]);
  assert.equal(expected.length, 8);
  assert.equal(gopIndex(gopsOf([0], 5), 4), 0);
});

test('the next group to prepare is the one ahead of the drag, then the one behind', () => {
  const none = () => false;
  assert.equal(prefetchTarget(1, 1, 4, none), 2);
  assert.equal(prefetchTarget(1, -1, 4, none), 0);
  assert.equal(prefetchTarget(1, 1, 4, (g) => g === 2), 0);
  assert.equal(prefetchTarget(1, 1, 4, (g) => g === 2 || g === 0), null);
  assert.equal(prefetchTarget(0, -1, 4, none), 1, 'nothing before the first group');
  assert.equal(prefetchTarget(3, 1, 4, (g) => g === 2), null, 'nothing after the last group');
});

test('the farthest groups go first, and the current one stays', () => {
  // Group 2 (10 frames), then 1 (10) and 3 (6) fit into 30 frames; group 0 does not.
  assert.deepEqual(evictions([0, 1, 2, 3], gops, 2, 30), [0]);
  assert.deepEqual(evictions([0, 1, 2], gops, 1, 100), []);
  assert.deepEqual(evictions([0, 1, 2, 3], gops, 3, 5), [2, 1, 0], 'even a tiny budget keeps the current group');
});
