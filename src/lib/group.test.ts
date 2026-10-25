import assert from 'node:assert/strict';
import { test } from 'vitest';

import { describeCentre, groupOf, sightMove, spreadCm } from './group.ts';

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
  const de = { left: 'links', right: 'rechts', low: 'tief', high: 'hoch', middle: 'in der Mitte' };
  assert.equal(describeCentre(group(-0.105, 0.04), 20, de), '2.1 cm links, 0.8 cm hoch');
  assert.equal(describeCentre(group(0, 0), 20, de), 'in der Mitte');
});

test('the centre in inches for imperial units', () => {
  const group = (cx: number, cy: number) => ({ n: 3, cx, cy, meanRadius: 0.1 });
  assert.equal(describeCentre(group(-0.127, 0.0635), 20, undefined, 'imperial'), '1.0 in left, 0.5 in high');
});

test('the sight moves towards the group', () => {
  const group = (cx: number, cy: number, n = 6) => ({ n, cx, cy, meanRadius: 0.1 });
  assert.deepEqual(sightMove(group(-0.1, -0.1), 20), { horizontal: 'left', vertical: 'down' });
  assert.deepEqual(sightMove(group(0.1, 0.1), 20), { horizontal: 'right', vertical: 'up' });
  assert.deepEqual(sightMove(group(0.1, 0.01), 20), { horizontal: 'right', vertical: null });
});

test('no sight hint for a small group or a centre less than half a centimetre off', () => {
  assert.equal(sightMove({ n: 5, cx: 0.5, cy: 0.5, meanRadius: 0.1 }, 20), null);
  assert.equal(sightMove({ n: 12, cx: 0.02, cy: -0.02, meanRadius: 0.1 }, 20), null); // 0.4 cm
  assert.notEqual(sightMove({ n: 12, cx: 0.0251, cy: 0, meanRadius: 0.1 }, 20), null); // just over 0.5 cm
});
