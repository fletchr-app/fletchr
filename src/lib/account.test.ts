import assert from 'node:assert/strict';
import { test } from 'vitest';

import { emailFormError, passwordFormError } from './account.ts';

test('a password change needs the current password, a long enough new one, twice, and different', () => {
  assert.equal(passwordFormError('old-password', 'new-password-1', 'new-password-1'), null);
  assert.match(passwordFormError('', 'new-password-1', 'new-password-1')!, /current/);
  assert.match(passwordFormError('old', 'short', 'short')!, /at least 8/);
  assert.match(passwordFormError('old-password', 'new-password-1', 'new-password-2')!, /not the same/);
  assert.match(passwordFormError('same-password', 'same-password', 'same-password')!, /different/);
});

test('an email change needs the password and a different, plausible address', () => {
  assert.equal(emailFormError('pw', 'new@x.test', 'old@x.test'), null);
  assert.equal(emailFormError('pw', ' New@X.test ', 'old@x.test'), null);
  assert.match(emailFormError('', 'new@x.test', 'old@x.test')!, /password/);
  assert.match(emailFormError('pw', 'nope', 'old@x.test')!, /email address/);
  assert.match(emailFormError('pw', 'OLD@x.test', 'old@x.test')!, /already/);
});
