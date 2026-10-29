import assert from 'node:assert/strict';
import { test } from 'vitest';

import { DEFAULT_SET_SIZE, lastNumberBefore, nextNumber, setSize, withNumber } from './arrow-numbers.ts';
import type { Equipment, LogEnd, LogShot } from './log-model.ts';

const shot = (arrow_number?: number): LogShot => ({ id: String(Math.random()), value: 9, is_x: false, is_miss: false, ...(arrow_number ? { arrow_number } : {}) });
const end = (index: number, numbers: (number | undefined)[]): LogEnd => ({ id: `e${index}`, index, distance_m: '18.0', face: 'wa-40', arrows_per_end: 3, shots: numbers.map(shot) });
const equipment: Equipment = { bows: [], arrowSets: [{ key: '5', id: 5, name: 'X10', revision: 1, revision_number: 1, count: 8 }, { key: '6', id: 6, name: 'Old', revision: 1, revision_number: 1, count: null }] };
const gear = (arrow_set_id: number | null) => ({ gear: { bow_id: 1, bow_revision: 1, bow_label: '', arrow_set_id, arrow_set_revision: null, arrow_label: '' } });

test('the numbers offered come from the arrow set, else twelve', () => {
  assert.equal(setSize(gear(5), equipment), 8);
  assert.equal(setSize(gear(6), equipment), DEFAULT_SET_SIZE);
  assert.equal(setSize(gear(null), equipment), DEFAULT_SET_SIZE);
  assert.equal(setSize({}, equipment), DEFAULT_SET_SIZE);
});

test('the sequence starts at 1 and goes on in the set, then round again', () => {
  assert.equal(nextNumber(12, [], null), 1);
  assert.equal(nextNumber(12, [1], 1), 2);
  assert.equal(nextNumber(12, [], 12), 1);
  assert.equal(nextNumber(8, [], 7), 8);
});

test('a number used in this end is skipped, and an end that uses them all has no suggestion', () => {
  assert.equal(nextNumber(12, [2], 1), 3);
  assert.equal(nextNumber(3, [1, 2, 3], 3), null);
  assert.equal(nextNumber(3, [3], 2), 1);
});

test('the sequence carries on from the last numbered arrow of the earlier ends', () => {
  const session = { ends: [end(0, [1, 2, 3]), end(1, [4, 5, 6]), end(2, [])] };
  assert.equal(lastNumberBefore(session, 2), 6);
  assert.equal(lastNumberBefore(session, 1), 3); // correcting end 2: what came before it
  assert.equal(lastNumberBefore(session, 0), null);
  assert.equal(lastNumberBefore({ ends: [end(0, [undefined, undefined])] }, 1), null); // nothing numbered
  assert.equal(lastNumberBefore({ ends: [end(0, [4, undefined])] }, 1), 4);
});

test('a numbered arrow is shown with its number', () => {
  assert.equal(withNumber('9', shot(4)), '9 (#4)');
  assert.equal(withNumber('9', shot()), '9');
});
