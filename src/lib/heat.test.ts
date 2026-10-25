import assert from 'node:assert/strict';
import { test } from 'vitest';

import { density } from './heat.ts';

const at = (h: ReturnType<typeof density>, row: number, column: number) => h.cells[row * h.size + column]!;
const peak = (h: ReturnType<typeof density>) => {
  const i = h.cells.indexOf(h.max);
  return [Math.floor(i / h.size), i % h.size];
};

test('no arrows, an empty picture', () => {
  const h = density([]);
  assert.equal(h.max, 0);
  assert.equal(h.cells.length, 1600);
  assert.equal(h.outside, 0);
});

test('an arrow in the middle peaks in the middle', () => {
  const [row, column] = peak(density([[0, 0]], 40, 1.2));
  assert.ok([19, 20].includes(row!) && [19, 20].includes(column!), `${row}, ${column}`);
});

test('right is to the right and up is towards the top row', () => {
  const [row, column] = peak(density([[0.8, 0.8]], 40, 1.2));
  assert.ok(column! > 25 && row! < 15, `${row}, ${column}`);
  const [row2, column2] = peak(density([[-0.8, -0.8]], 40, 1.2));
  assert.ok(column2! < 15 && row2! > 25, `${row2}, ${column2}`);
});

test('the picture is mirrored for a mirrored arrow', () => {
  const a = density([[0.3, 0.5]]);
  const b = density([[-0.3, 0.5]]);
  for (let r = 0; r < a.size; r++) for (let c = 0; c < a.size; c++) assert.ok(Math.abs(at(a, r, c) - at(b, r, a.size - 1 - c)) < 1e-9);
});

test('more arrows at the same place make a higher peak', () => {
  assert.ok(density([[0.2, 0.2], [0.2, 0.2], [0.2, 0.2]]).max > 2.9 * density([[0.2, 0.2]]).max);
});

test('arrows beyond the grid are counted apart and add nothing', () => {
  const h = density([[3, 0], [0, -2], [0.1, 0.1]]);
  assert.equal(h.outside, 2);
  assert.ok(h.max > 0);
  assert.equal(density([[3, 0]]).max, 0);
});

test('an arrow near the edge does not leak outside the grid', () => {
  const h = density([[1.19, 1.19]]);
  assert.equal(h.cells.length, 1600);
  assert.ok(h.max > 0.9);
});
