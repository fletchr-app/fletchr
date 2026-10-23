import assert from 'node:assert/strict';
import { test } from 'vitest';

import { emailFormError, passwordFormError } from './account.ts';

test('a password change needs the current password, a long enough new one, twice, and different', () => {
  assert.equal(passwordFormError('old-password', 'new-password-1', 'new-password-1'), null);
  assert.equal(passwordFormError('', 'new-password-1', 'new-password-1')!.key, 'account.errors.currentRequired');
  assert.deepEqual(passwordFormError('old', 'short', 'short'), { key: 'account.errors.passwordShort', params: { n: 8 } });
  assert.equal(passwordFormError('old-password', 'new-password-1', 'new-password-2')!.key, 'account.errors.notSame');
  assert.equal(passwordFormError('same-password', 'same-password', 'same-password')!.key, 'account.errors.sameAsOld');
});

test('an email change needs the password and a different, plausible address', () => {
  assert.equal(emailFormError('pw', 'new@x.test', 'old@x.test'), null);
  assert.equal(emailFormError('pw', ' New@X.test ', 'old@x.test'), null);
  assert.equal(emailFormError('', 'new@x.test', 'old@x.test')!.key, 'account.errors.currentRequired');
  assert.equal(emailFormError('pw', 'nope', 'old@x.test')!.key, 'account.errors.emailInvalid');
  assert.equal(emailFormError('pw', 'OLD@x.test', 'old@x.test')!.key, 'account.errors.emailSame');
});
