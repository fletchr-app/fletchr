import assert from 'node:assert/strict';
import { test } from 'vitest';

import { PENDING_RESET_MS, packPendingReset, unpackPendingReset } from './pending-reset.ts';

test('the address comes back within the hour', () => {
  const raw = packPendingReset('me@x.test', 1_000);
  assert.equal(unpackPendingReset(raw, 1_000), 'me@x.test');
  assert.equal(unpackPendingReset(raw, 1_000 + PENDING_RESET_MS - 1), 'me@x.test');
});

test('an old, missing or damaged entry gives nothing', () => {
  const raw = packPendingReset('me@x.test', 1_000);
  assert.equal(unpackPendingReset(raw, 1_000 + PENDING_RESET_MS), null);
  assert.equal(unpackPendingReset(raw, 500), null); // from the future: the clock was changed
  for (const bad of [null, '', 'nope', '{}', '{"email":3,"at":1}', '{"email":"a@b.c"}']) assert.equal(unpackPendingReset(bad, 1_000), null, String(bad));
});
