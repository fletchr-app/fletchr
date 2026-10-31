import assert from 'node:assert/strict';
import { test } from 'vitest';

import { addDays, addMonths, daysOf, dotsByDay, firstWeekday, monthGrid, rangeOf } from './calendar.ts';
import { type AgendaItem, dayKey } from './schedule.ts';

// The helpers read the device's clock; the DST cases need a zone with a time change (25 October 2026 and 29 March 2026).
process.env.TZ = 'Europe/Berlin';

const item = (start: string, end: string, extra: Partial<AgendaItem> = {}): AgendaItem => ({
  id: start, virtual: true, slot: 's', date: null, team: 1, team_name: 'Team A', kind: 'training', name: '', start, end, location: '', time_zone: 'Europe/Berlin', cancelled: false, ...extra,
});

test('the test zone is in effect', () => {
  assert.equal(new Date('2026-07-01T12:00:00Z').getTimezoneOffset(), -120);
  assert.equal(new Date('2026-12-01T12:00:00Z').getTimezoneOffset(), -60);
});

test('addDays steps calendar dates across month and year ends', () => {
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(addDays('2026-10-05', 0), '2026-10-05');
});

test('addDays steps one date over a time change', () => {
  assert.equal(addDays('2026-10-24', 2), '2026-10-26');
  assert.equal(addDays('2026-10-26', -2), '2026-10-24');
  assert.equal(addDays('2026-03-28', 2), '2026-03-30');
});

test('addMonths goes across a year end', () => {
  assert.equal(addMonths('2026-12', 1), '2027-01');
  assert.equal(addMonths('2026-01', -1), '2025-12');
  assert.equal(addMonths('2026-10', 0), '2026-10');
});

test('monthGrid pads to whole weeks for a Monday and a Sunday start', () => {
  const monday = monthGrid('2026-10', 1);
  assert.equal(monday.length, 35);
  assert.equal(monday[0], '2026-09-28');
  assert.equal(monday[34], '2026-11-01');
  const sunday = monthGrid('2026-10', 0);
  assert.equal(sunday.length, 35);
  assert.equal(sunday[0], '2026-09-27');
  assert.equal(sunday[34], '2026-10-31');
});

test('monthGrid: four rows for a February that fits, six rows when the month needs them', () => {
  assert.equal(monthGrid('2026-02', 0).length, 28);
  assert.equal(monthGrid('2026-02', 1).length, 35);
  const six = monthGrid('2026-08', 1);
  assert.equal(six.length, 42);
  assert.equal(six[0], '2026-07-27');
  assert.equal(six[41], '2026-09-06');
});

test('monthGrid keeps one entry per day over a time change', () => {
  const days = monthGrid('2026-10', 1);
  assert.equal(new Set(days).size, days.length);
  assert.ok(days.includes('2026-10-25'));
  const march = monthGrid('2026-03', 1);
  assert.equal(new Set(march).size, march.length);
  assert.ok(march.includes('2026-03-29'));
});

test('firstWeekday follows the locale and falls back to Monday', () => {
  assert.equal(firstWeekday('de'), 1);
  assert.equal(firstWeekday('en-US'), 0);
  assert.equal(firstWeekday('not a locale'), 1);
});

test('rangeOf runs from local midnight to the local midnight after the last day', () => {
  assert.deepEqual(rangeOf(['2026-10-10']), { from: '2026-10-09T22:00:00.000Z', to: '2026-10-10T22:00:00.000Z' });
  // the 25-hour day
  assert.deepEqual(rangeOf(['2026-10-25']), { from: '2026-10-24T22:00:00.000Z', to: '2026-10-25T23:00:00.000Z' });
  // the 23-hour day
  assert.deepEqual(rangeOf(['2026-03-29']), { from: '2026-03-28T23:00:00.000Z', to: '2026-03-29T22:00:00.000Z' });
});

test('dayKey is the date on the device clock', () => {
  assert.equal(dayKey('2026-10-10T22:30:00Z'), '2026-10-11');
  assert.equal(dayKey('2026-10-10T21:59:00Z'), '2026-10-10');
});

test('daysOf: a training is one day, also when it ends at midnight', () => {
  assert.deepEqual(daysOf(item('2026-10-10T16:00:00Z', '2026-10-10T18:00:00Z')), ['2026-10-10']);
  assert.deepEqual(daysOf(item('2026-10-10T20:00:00Z', '2026-10-10T22:00:00Z')), ['2026-10-10']); // ends 00:00 local on the 11th
});

test('daysOf: a camp covers each day it touches', () => {
  assert.deepEqual(daysOf(item('2026-10-09T15:00:00Z', '2026-10-11T10:00:00Z')), ['2026-10-09', '2026-10-10', '2026-10-11']);
  // across the 25-hour day
  assert.deepEqual(daysOf(item('2026-10-24T12:00:00Z', '2026-10-26T12:00:00Z')), ['2026-10-24', '2026-10-25', '2026-10-26']);
});

test('daysOf: an end that is not after the start leaves the start day', () => {
  assert.deepEqual(daysOf(item('2026-10-10T16:00:00Z', '2026-10-10T16:00:00Z')), ['2026-10-10']);
  assert.deepEqual(daysOf(item('2026-10-10T16:00:00Z', '2026-10-09T16:00:00Z')), ['2026-10-10']);
});

test('dotsByDay counts trainings and cancelled ones apart, and a camp on every day', () => {
  const dots = dotsByDay([
    item('2026-10-10T16:00:00Z', '2026-10-10T18:00:00Z'),
    item('2026-10-10T17:00:00Z', '2026-10-10T19:00:00Z', { cancelled: true }),
    item('2026-10-10T14:00:00Z', '2026-10-10T15:00:00Z'),
    item('2026-10-10T12:00:00Z', '2026-10-12T12:00:00Z', { kind: 'camp' }),
  ]);
  assert.deepEqual(dots.get('2026-10-10'), { count: 3, cancelled: 1 });
  assert.deepEqual(dots.get('2026-10-11'), { count: 1, cancelled: 0 });
  assert.deepEqual(dots.get('2026-10-12'), { count: 1, cancelled: 0 });
  assert.equal(dots.get('2026-10-13'), undefined);
});
