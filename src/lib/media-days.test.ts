import assert from 'node:assert/strict';
import { test } from 'vitest';

import { byDay, dayTitle } from './media-days.ts';

const at = (y: number, m: number, d: number, h: number) => new Date(y, m - 1, d, h).toISOString();

test('items on the same day share a section, in the order they came', () => {
  const days = byDay([
    { id: 'a', taken_at: at(2026, 10, 24, 18) },
    { id: 'b', taken_at: at(2026, 10, 24, 9) },
    { id: 'c', taken_at: at(2026, 10, 23, 23) },
  ]);
  assert.deepEqual(days.map((d) => [d.day, d.items.map((i) => i.id)]), [['2026-10-24', ['a', 'b']], ['2026-10-23', ['c']]]);
});

test('the day is the local one', () => {
  assert.equal(byDay([{ taken_at: at(2026, 1, 5, 23) }])[0]!.day, '2026-01-05');
  assert.equal(byDay([{ taken_at: at(2026, 1, 5, 0) }])[0]!.day, '2026-01-05');
});

test('nothing gives no sections, and a heading names the weekday', () => {
  assert.deepEqual(byDay([]), []);
  const title = dayTitle('2026-10-24', 'en');
  for (const part of ['Saturday', 'October', '24', '2026']) assert.ok(title.includes(part), title);
});
