import assert from 'node:assert/strict';
import { test } from 'vitest';

import { ARROW_SET_FIELDS, BOW_FIELDS, emptyValues } from './equipment-fields.ts';

test('a new bow starts with a type selected, everything else empty', () => {
  const values = emptyValues(BOW_FIELDS);
  assert.equal(values.type, 'recurve');
  assert.deepEqual(Object.entries(values).filter(([key, value]) => value !== '' && key !== 'type'), []);
});

test('a new arrow set starts empty', () => {
  assert.ok(Object.values(emptyValues(ARROW_SET_FIELDS)).every((value) => value === ''));
});
