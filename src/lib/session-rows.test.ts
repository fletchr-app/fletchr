import assert from 'node:assert/strict';
import { test } from 'vitest';

import type { LogSession } from './log-model.ts';
import { sessionRows } from './session-rows.ts';

const local = (id: string, started_at: string): LogSession => ({
  id, started_at, ended_at: null, type: 'scoring', environment: 'indoor', location: 'Hall', ends: [], volume: [],
});
const remote = (id: string, started_at: string) =>
  ({ id, started_at, ended_at: '2026-10-18T10:00:00Z', type: 'scoring', location: '', ends: 2, scored_arrows: 6, volume_arrows: 0, score_total: 50 }) as never;

test('local and server sessions are merged, newest first, a shared one is shown from the device', () => {
  const rows = sessionRows(
    [local('a', '2026-10-18T09:00:00Z'), local('b', '2026-10-17T09:00:00Z')],
    [remote('b', '2026-10-17T09:00:00Z'), remote('c', '2026-10-19T09:00:00Z')],
  );
  assert.deepEqual(rows.map((r) => [r.id, r.to]), [['c', '/sessions/c'], ['a', '/training/a'], ['b', '/training/b']]);
  assert.equal(rows[0]!.points, 50);
  assert.equal(rows[0]!.finished, true);
});
