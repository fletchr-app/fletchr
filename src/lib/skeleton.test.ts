import { strict as assert } from 'node:assert';
import { test } from 'vitest';

import { BONES, type Landmark, pickPose, skeletonShapes } from './skeleton.ts';

const full = (x = 0.5, y = 0.5, v = 1): Landmark[] => Array.from({ length: 33 }, (_, i) => ({ x: x + i * 0.001, y: y + i * 0.001, visibility: v }));

test('a full pose gives the body lines and the neck', () => {
  const shapes = skeletonShapes(full(), '#f00');
  assert.equal(shapes.length, BONES.length + 1);
  assert.ok(shapes.every((s) => s.t === 'line' && s.p.length === 2 && s.c === '#f00'));
});

test('the lines share their joints exactly, so they move together', () => {
  const shapes = skeletonShapes(full(), '#f00');
  const upper = shapes.find((s) => s.p[0]![0] === 0.5 + 11 * 0.001 && s.p[1]![0] === 0.5 + 13 * 0.001)!;
  const fore = shapes.find((s) => s.p[0]![0] === 0.5 + 13 * 0.001 && s.p[1]![0] === 0.5 + 15 * 0.001)!;
  assert.deepEqual(upper.p[1], fore.p[0]);
});

test('a line is left out when one end is not seen', () => {
  const pose = full();
  pose[13] = { x: 0.5, y: 0.5, visibility: 0.2 };
  const shapes = skeletonShapes(pose, '#f00');
  assert.equal(shapes.length, BONES.length + 1 - 2); // 11-13 and 13-15
});

test('points outside the picture are put on its edge', () => {
  const pose = full();
  pose[11] = { x: -0.2, y: 1.3, visibility: 1 };
  const shape = skeletonShapes(pose, '#f00').find((s) => s.p[0]![0] === 0 && s.p[0]![1] === 1)!;
  assert.ok(shape);
});

test('the pose with the largest box is picked, and nothing for an empty list', () => {
  const small = full(0.4, 0.4).map((l) => ({ ...l, x: 0.4 + (l.x - 0.4) / 10, y: 0.4 + (l.y - 0.4) / 10 }));
  const big = full(0.1, 0.1);
  assert.equal(pickPose([small, big]), big);
  assert.equal(pickPose([]), null);
  assert.equal(pickPose([full(0.5, 0.5, 0)]), null);
});
