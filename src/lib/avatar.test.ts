import assert from 'node:assert/strict';
import { test } from 'vitest';

import { initials } from './avatar.ts';

test('two words give two letters, one word gives one', () => {
  assert.equal(initials('Tim Husser'), 'TH');
  assert.equal(initials('anna maria von Hoff'), 'AH');
  assert.equal(initials('Tim'), 'T');
});

test('umlauts and extra spaces', () => {
  assert.equal(initials('  Özlem   Ünal '), 'ÖÜ');
});

test('without a name the email is used, without both a question mark', () => {
  assert.equal(initials('', 'coach@a.test'), 'C');
  assert.equal(initials('   '), '?');
});
