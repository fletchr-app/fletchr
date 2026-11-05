import assert from 'node:assert/strict';
import { test } from 'vitest';

import { reachedServer } from './connection.ts';

test('an answer from the app or a refusal means the server was reached', () => {
  for (const status of [200, 204, 400, 401, 404, 409, 500]) assert.equal(reachedServer(status), true, String(status));
});

test('the proxy answering for a stopped server means it was not', () => {
  for (const status of [502, 503, 504]) assert.equal(reachedServer(status), false, String(status));
});
