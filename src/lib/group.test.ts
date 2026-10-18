import assert from 'node:assert/strict';
import { test } from 'vitest';

import { describeCentre, groupOf, spreadCm } from './group.ts';

const near = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test('no arrows, no group', () => {
  assert.equal(groupOf([]), null);
});

test('one arrow is its own centre with no spread', () => {
  const g = groupOf([{ x: 0.2, y: -0.1 }])!;
  assert.deepEqual([g.n, g.cx, g.cy, g.meanRadius], [1, 0.2, -0.1, 0]);
});

test('the centre is the mean and the spread is the mean distance from it', () => {
  const g = groupOf([{ x: 0.1, y: 0 }, { x: 0.3, y: 0 }, { x: 0.2, y: 0.2 }, { x: 0.2, y: -0.2 }])!;
  near(g.cx, 0.2);
  near(g.cy, 0);
  near(g.meanRadius, 0.15); // every arrow is 0.1, 0.1, 0.2 or 0.2 away
  near(spreadCm(g, 20), 3);
});

test('the sight hint says which way the centre is off, in cm of the real spot', () => {
  const group = (cx: number, cy: number) => ({ n: 3, cx, cy, meanRadius: 0.1 });
  assert.equal(describeCentre(group(-0.105, 0.04), 20), '2.1 cm left, 0.8 cm high');
  assert.equal(describeCentre(group(0.5, -0.25), 10), '5.0 cm right, 2.5 cm low');
  assert.equal(describeCentre(group(0, 0.1), 20), '2.0 cm high');
  assert.equal(describeCentre(group(0.001, -0.001), 20), 'in the middle');
});
