import assert from 'node:assert/strict';
import { test } from 'vitest';

import { centreSquare, fitWithin } from './image.ts';

test('the profile picture is cut from the middle, whatever the shape', () => {
  assert.deepEqual(centreSquare(400, 300), { x: 50, y: 0, side: 300 });
  assert.deepEqual(centreSquare(300, 400), { x: 0, y: 50, side: 300 });
  assert.deepEqual(centreSquare(300, 300), { x: 0, y: 0, side: 300 });
  assert.deepEqual(centreSquare(1, 1), { x: 0, y: 0, side: 1 });
  assert.deepEqual(centreSquare(401, 300), { x: 50, y: 0, side: 300 });
});

test('a large picture is scaled so its long side fits, in the same proportions', () => {
  assert.deepEqual(fitWithin(4000, 3000, 2000), { width: 2000, height: 1500 });
  assert.deepEqual(fitWithin(3000, 4000, 2000), { width: 1500, height: 2000 });
});

test('a small picture stays as it is', () => {
  assert.deepEqual(fitWithin(800, 600, 2000), { width: 800, height: 600 });
  assert.deepEqual(fitWithin(2000, 2000, 2000), { width: 2000, height: 2000 });
});

test('a very thin picture keeps at least one pixel', () => {
  assert.deepEqual(fitWithin(10000, 2, 1000), { width: 1000, height: 1 });
});
