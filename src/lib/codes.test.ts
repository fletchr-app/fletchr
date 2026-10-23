import assert from 'node:assert/strict';
import { test } from 'vitest';

import { formatCode } from './codes.ts';

test('a code is shown in groups of four', () => {
  assert.equal(formatCode('ABCDEFGHJKMN'), 'ABCD-EFGH-JKMN');
  assert.equal(formatCode('AB12CD34EF'), 'AB12-CD34-EF'); // an older, shorter code
  assert.equal(formatCode('abcd efgh-jkmn'), 'ABCD-EFGH-JKMN');
  assert.equal(formatCode('ABCD'), 'ABCD');
  assert.equal(formatCode(''), '');
});
