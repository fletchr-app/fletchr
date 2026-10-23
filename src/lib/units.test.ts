import assert from 'node:assert/strict';
import { test } from 'vitest';

import { distanceField, formatDistance, formatLength, parseDistance } from './units.ts';

test('distances are shown in metres or in whole yards', () => {
  assert.equal(formatDistance(18, 'metric'), '18 m');
  assert.equal(formatDistance('22.5', 'metric'), '22.5 m');
  assert.equal(formatDistance('18.0', 'metric'), '18 m');
  assert.equal(formatDistance(18, 'imperial'), '20 yd');
  assert.equal(formatDistance(70, 'imperial'), '77 yd');
  assert.equal(distanceField('64.0', 'imperial'), '70');
  assert.equal(distanceField('18', 'metric'), '18');
});

test('a typed distance is read in the chosen unit and kept in metres', () => {
  assert.equal(parseDistance('18', 'metric'), 18);
  assert.equal(parseDistance('22,5', 'metric'), 22.5);
  assert.equal(parseDistance('20', 'imperial'), 18.3);
  assert.equal(parseDistance('70', 'imperial'), 64);
  assert.equal(parseDistance('', 'metric'), null);
  assert.equal(parseDistance('abc', 'imperial'), null);
  assert.equal(parseDistance('-5', 'metric'), null);
});

test('a typed yard value comes back as the same yards', () => {
  for (const yards of [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]) {
    const metres = parseDistance(String(yards), 'imperial')!;
    assert.equal(formatDistance(metres, 'imperial'), `${yards} yd`);
  }
});

test('group sizes in cm or inches', () => {
  assert.equal(formatLength(3.8, 'metric'), '3.8 cm');
  assert.equal(formatLength(2.54, 'imperial'), '1.0 in');
  assert.equal(formatLength(0.3, 'imperial'), '0.1 in');
});
