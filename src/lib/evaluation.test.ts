import assert from 'node:assert/strict';
import { test } from 'vitest';

import { average, groupCriteria, moved, ratings, toScores } from './evaluation.ts';

test('criteria are grouped in the order the groups first appear', () => {
  const g = groupCriteria([{ group: 'A', n: 1 }, { group: 'B', n: 2 }, { group: 'A', n: 3 }]);
  assert.deepEqual(g.map((x) => [x.group, x.items.map((i) => i.n)]), [['A', [1, 3]], ['B', [2]]]);
});

test('the average is rounded to one decimal and empty is null', () => {
  assert.equal(average([{ rating: 4 }, { rating: 5 }, { rating: 5 }]), 4.7);
  assert.equal(average([]), null);
});

test('ratings run from 1 to the scale', () => {
  assert.deepEqual(ratings(3), [1, 2, 3]);
});

test('only rated criteria go to the server, with the frame where there is one', () => {
  const scores = toScores({
    a: { rating: 4, comment: ' good ', media: 'm1', frame: 10, timeMs: 83 },
    b: { rating: null, comment: 'x', media: null, frame: null, timeMs: null },
    c: { rating: 2, comment: '', media: null, frame: null, timeMs: null },
  });
  assert.deepEqual(scores, [{ criterion: 'a', rating: 4, comment: 'good', media: 'm1', frame: 10, time_ms: 83 }, { criterion: 'c', rating: 2, comment: '' }]);
});

test('an item moves up or down and stops at the ends', () => {
  assert.deepEqual(moved([1, 2, 3], 2, 1), [1, 3, 2]);
  assert.deepEqual(moved([1, 2, 3], 0, 1), [2, 1, 3]);
  assert.deepEqual(moved([1, 2, 3], 0, -1), [1, 2, 3]);
  assert.deepEqual(moved([1, 2, 3], 2, 3), [1, 2, 3]);
});
