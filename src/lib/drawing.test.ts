import assert from 'node:assert/strict';
import { test } from 'vitest';

import { angleDegrees, circleRadii, clamp01, fitted, movedPoint, nearestPoint, pointOn, readDrawing } from './drawing.ts';

const near = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} is not ${b}`);

test('a right angle is 90 degrees, in the real shape of the picture', () => {
  near(angleDegrees([1, 0.5], [0.5, 0.5], [0.5, 1], 1000, 1000), 90);
  near(angleDegrees([1, 0.5], [0.5, 0.5], [0.5, 1], 1920, 1080), 90); // fractions of unequal sides still give a right angle
});

test('the same fractions give another angle in a wide picture', () => {
  // the diagonal of a 2:1 picture is not 45 degrees
  near(angleDegrees([1, 0.5], [0.5, 0.5], [1, 1], 2000, 1000), (Math.atan(1000 * 0.5 / (2000 * 0.5)) * 180) / Math.PI);
});

test('a straight line is 180 degrees and a fold is 0', () => {
  near(angleDegrees([0, 0.5], [0.5, 0.5], [1, 0.5], 800, 600), 180);
  near(angleDegrees([1, 0.5], [0.5, 0.5], [0.8, 0.5], 800, 600), 0);
});

test('an angle with a point on the corner is 0, not a failure', () => {
  assert.equal(angleDegrees([0.5, 0.5], [0.5, 0.5], [0.9, 0.9], 800, 600), 0);
});

test('a circle keeps its round shape in the picture', () => {
  const { rx, ry } = circleRadii([0.5, 0.5], [0.6, 0.5], 1000, 500);
  near(rx, 0.1);
  near(ry, 0.2); // the same distance is twice as many fractions of the height
});

test('a pointer is placed on the picture and stays on it', () => {
  const rect = { left: 10, top: 20, width: 200, height: 100 };
  assert.deepEqual(pointOn(rect, 110, 70), [0.5, 0.5]);
  assert.deepEqual(pointOn(rect, -50, 500), [0, 1]);
  assert.equal(clamp01(2), 1);
});

test('the picture fits the box whole', () => {
  assert.deepEqual(fitted({ width: 400, height: 400 }, 2), { width: 400, height: 200 });
  assert.deepEqual(fitted({ width: 400, height: 200 }, 0.5), { width: 100, height: 200 });
  assert.deepEqual(fitted({ width: 0, height: 10 }, 1), { width: 0, height: 0 });
});

test('an empty or odd value is an empty drawing', () => {
  assert.deepEqual(readDrawing(null), { v: 1, shapes: [] });
  assert.deepEqual(readDrawing({ shapes: 'x' }), { v: 1, shapes: [] });
  assert.equal(readDrawing({ v: 1, shapes: [{ t: 'line', p: [[0, 0], [1, 1]] }] }).shapes.length, 1);
});

test('the nearest point is found within reach, in pixels of the screen', () => {
  const shapes = [
    { t: 'line' as const, p: [[0.1, 0.1], [0.9, 0.1]] as [number, number][] },
    { t: 'angle' as const, p: [[0.5, 0.5], [0.52, 0.5], [0.9, 0.9]] as [number, number][] },
  ];
  const size = { width: 1000, height: 500 };
  assert.deepEqual(nearestPoint(shapes, [0.515, 0.5], size, 28), { shape: 1, point: 1 }); // 5 px from the second point
  assert.equal(nearestPoint(shapes, [0.3, 0.3], size, 28), null);
  assert.equal(nearestPoint(shapes, [0.1, 0.1 + 40 / 500], size, 28), null); // 40 px away is too far
  assert.deepEqual(nearestPoint(shapes, [0.1, 0.1 + 20 / 500], size, 28), { shape: 0, point: 0 });
});

test('moving a point gives a new shape and leaves the old one alone', () => {
  const old = { t: 'angle' as const, p: [[0, 0], [0.5, 0.5], [1, 0]] as [number, number][], c: '#fff' };
  const moved = movedPoint(old, 1, [0.4, 0.6]);
  assert.deepEqual(moved, { t: 'angle', p: [[0, 0], [0.4, 0.6], [1, 0]], c: '#fff' });
  assert.deepEqual(old.p[1], [0.5, 0.5]);
});
