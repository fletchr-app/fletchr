import assert from 'node:assert/strict';
import { test } from 'vitest';

import { expiresAt, jwtPayload, userIdOf } from './jwt.ts';

const token = (payload: object) => {
  const b64url = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(payload)}.signature`;
};

test('reads the user id as the server sends it (a string), or as a number', () => {
  // Payload copied from a real access token of this server.
  const real = token({ token_type: 'access', exp: 1792343431, iat: 1792343131, jti: '9b37', user_id: '2' });
  assert.equal(userIdOf(real), '2');
  assert.equal(userIdOf(token({ user_id: 7 })), '7');
});

test('reads the expiry in milliseconds', () => {
  assert.equal(expiresAt(token({ exp: 1792343431 })), 1792343431000);
});

test('garbage gives null, 0 and null instead of throwing', () => {
  for (const bad of ['', 'abc', 'a.b.c', token({})]) {
    assert.equal(userIdOf(bad), null);
    assert.equal(expiresAt(bad), 0);
  }
  assert.equal(jwtPayload('a.!!!.c'), null);
});

test('handles payloads that need base64url padding and URL-safe characters', () => {
  const payload = { user_id: '12', name: '>>>???~~~' }; // encodes with - and _ characters
  assert.equal(userIdOf(token(payload)), '12');
});
