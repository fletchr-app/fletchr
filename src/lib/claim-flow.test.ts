import assert from 'node:assert/strict';
import { test } from 'vitest';

import { beforeRequest, type ClaimGate, type Decision, decide, enter } from './claim-flow.ts';
import type { LocalCounts } from './local-claim.ts';
import type { StoreOwner } from './store-owner.ts';

const COUNTS: LocalCounts = { sessions: 2, bows: 0, arrowSets: 0, photos: 1, videos: 0, notes: 0 };
const EMPTY: LocalCounts = { sessions: 0, bows: 0, arrowSets: 0, photos: 0, videos: 0, notes: 0 };
const ACCOUNT = { owner: { kind: 'account', server: 'https://s', userId: '7' } as StoreOwner, userId: 7 };

function setup(over: { counts?: LocalCounts | null; decision?: Decision; moved?: boolean } = {}) {
  const log: string[] = [];
  const gate: ClaimGate = {
    counts: async () => (over.counts === undefined ? COUNTS : over.counts),
    ask: async (info) => {
      log.push(`ask ${info.email} ${info.counts.sessions}`);
      return over.decision ?? { kind: 'keep' };
    },
    upload: async (a) => {
      log.push(`upload ${a.localId} ${a.userId} ${a.share}`);
      return over.moved ?? true;
    },
  };
  const session = { commit: () => void log.push('commit'), revoke: async () => void log.push('revoke') };
  return { gate, session, log };
}
const email = async () => 'a@b.de';

test('an empty local owner gives no prompt', async () => {
  for (const counts of [EMPTY, null]) {
    const { gate, log } = setup({ counts });
    assert.deepEqual(await decide(gate, 'L', email), { kind: 'none' });
    assert.deepEqual(log, []);
  }
  assert.deepEqual(await decide(setup().gate, null, email), { kind: 'none' }, 'no owner id, nothing to ask');
});

test('with data the person is asked once, with the email and the counts', async () => {
  const { gate, log } = setup({ decision: { kind: 'keep' } });
  assert.deepEqual(await decide(gate, 'L', email), { kind: 'keep' });
  assert.deepEqual(log, ['ask a@b.de 2']);
});

test('Upload moves the data first and keeps the tokens after it', async () => {
  const { gate, session, log } = setup();
  assert.deepEqual(await enter(gate, { kind: 'upload', share: true }, 'L', ACCOUNT, session), { kind: 'signedIn' });
  assert.deepEqual(log, ['upload L 7 true', 'commit']);
});

test('the answer to the share question reaches the upload', async () => {
  const { gate, session, log } = setup();
  await enter(gate, { kind: 'upload', share: false }, 'L', ACCOUNT, session);
  assert.equal(log[0], 'upload L 7 false');
});

test('Keep on this phone only signs in and moves nothing', async () => {
  const { gate, session, log } = setup();
  assert.deepEqual(await enter(gate, { kind: 'keep' }, 'L', ACCOUNT, session), { kind: 'signedIn' });
  assert.deepEqual(log, ['commit']);
});

test('no question needed: sign in', async () => {
  const { gate, session, log } = setup();
  assert.deepEqual(await enter(gate, { kind: 'none' }, null, ACCOUNT, session), { kind: 'signedIn' });
  assert.deepEqual(log, ['commit']);
});

test('Cancel on sign-in revokes the refresh token and never keeps the tokens', async () => {
  const { gate, session, log } = setup();
  assert.deepEqual(await enter(gate, { kind: 'cancel' }, 'L', ACCOUNT, session), { kind: 'cancelled' });
  assert.deepEqual(log, ['revoke']);
});

test('a failed move revokes the tokens and keeps the person out, so nothing looks uploaded', async () => {
  for (const moved of [false, undefined]) {
    const { gate, session, log } = setup({ moved: moved ?? true });
    if (moved === undefined) gate.upload = async () => Promise.reject(new Error('boom'));
    assert.deepEqual(await enter(gate, { kind: 'upload', share: true }, 'L', ACCOUNT, session), { kind: 'failed' });
    assert.equal(log.includes('commit'), false);
    assert.equal(log.at(-1), 'revoke');
  }
});

test('register: Cancel sends nothing', async () => {
  const { gate, log } = setup({ decision: { kind: 'cancel' } });
  let sent = 0;
  const result = await beforeRequest(gate, 'L', email, async () => ++sent);
  assert.deepEqual(result, { kind: 'cancelled' });
  assert.equal(sent, 0);
  assert.deepEqual(log, ['ask a@b.de 2']);
});

test('register: the question comes before the request, and the answer is handed on', async () => {
  const { gate, log } = setup({ decision: { kind: 'upload', share: false } });
  const result = await beforeRequest(gate, 'L', email, async () => {
    log.push('request');
    return 'tokens';
  });
  assert.deepEqual(result, { kind: 'sent', result: 'tokens', decision: { kind: 'upload', share: false } });
  assert.deepEqual(log, ['ask a@b.de 2', 'request']);
});

test('register with nothing on the phone just sends', async () => {
  const { gate, log } = setup({ counts: EMPTY });
  assert.deepEqual(await beforeRequest(gate, 'L', email, async () => 1), { kind: 'sent', result: 1, decision: { kind: 'none' } });
  assert.deepEqual(log, []);
});
