import assert from 'node:assert/strict';
import createClient from 'openapi-fetch';
import { test } from 'vitest';

import type { paths } from './api-types.ts';
import { drainEvaluations, sendEvaluation } from './evaluation-sync.ts';
import { EMPTY_EVALUATIONS, type EvaluationAction, type EvaluationsState, evidenceOf, pendingEvaluations, type QueuedEvaluation, reduce } from './evaluation-store.ts';

type Call = { method: string; path: string; body: unknown };
const json = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function harness(handler: (call: Call) => Response, blocked: (e: QueuedEvaluation) => boolean = () => false) {
  let state: EvaluationsState = EMPTY_EVALUATIONS;
  const dispatch = (a: EvaluationAction) => (state = reduce(state, a));
  const calls: Call[] = [];
  const api = createClient<paths>({
    baseUrl: 'http://server',
    fetch: async (request: Request) => {
      const text = await request.clone().text();
      const call = { method: request.method, path: new URL(request.url).pathname, body: text ? JSON.parse(text) : null };
      calls.push(call);
      return handler(call);
    },
  });
  const run = () => drainEvaluations(() => state, dispatch, (e) => sendEvaluation(api, e), blocked);
  return { dispatch, calls, run, state: () => state };
}

const evaluation = (uid: string, extra: Partial<QueuedEvaluation> = {}): QueuedEvaluation => ({
  uid, archer: 7, archer_name: 'Ann', team: 1, template: 3, kind: 'coach', date: '2026-11-07', comment: 'Good block', goals: '', visibility: 'coach_only',
  scores: [{ criterion: 'pre_back', rating: 4, comment: '' }], created_at: 'n', ...extra,
});
const saved = () => json(201, { id: 12, uid: 'x' });

test('an evaluation goes up by its uid with everything it holds', async () => {
  const h = harness(saved);
  h.dispatch({ type: 'add', evaluation: evaluation('e1', { scores: [{ criterion: 'pre_back', rating: 4, comment: 'ok', media: 'm1', frame: 3, time_ms: 1200 }] }) });
  await h.run();
  assert.deepEqual(h.calls.map((c) => `${c.method} ${c.path}`), ['PUT /api/evaluations/e1/']);
  assert.deepEqual(h.calls[0].body, {
    archer: 7, team: 1, template: 3, kind: 'coach', date: '2026-11-07', comment: 'Good block', goals: '', visibility: 'coach_only',
    scores: [{ criterion: 'pre_back', rating: 4, comment: 'ok', media: 'm1', frame: 3, time_ms: 1200 }],
  });
  assert.equal(h.state().evaluations.length, 0);
});

test('a self-assessment goes up without a visibility, the server makes it shared', async () => {
  const h = harness(saved);
  h.dispatch({ type: 'add', evaluation: evaluation('e1', { kind: 'self' }) });
  await h.run();
  assert.equal('visibility' in (h.calls[0].body as object), false);
});

test('an evaluation whose clip is still waiting is passed over, and the others go', async () => {
  const h = harness(saved, (e) => evidenceOf(e).includes('m1'));
  h.dispatch({ type: 'add', evaluation: evaluation('wait', { scores: [{ criterion: 'pre_back', rating: 3, media: 'm1', frame: 1, time_ms: 10 }] }) });
  h.dispatch({ type: 'add', evaluation: evaluation('go') });
  await h.run();
  assert.deepEqual(h.calls.map((c) => c.path), ['/api/evaluations/go/']);
  assert.deepEqual(h.state().evaluations.map((e) => e.uid), ['wait']);
});

test('no connection and a server error keep everything for the next try', async () => {
  for (const handler of [() => json(503), () => json(401)]) {
    const h = harness(handler);
    h.dispatch({ type: 'add', evaluation: evaluation('e1') });
    h.dispatch({ type: 'add', evaluation: evaluation('e2') });
    await h.run();
    assert.equal(h.calls.length, 1, 'the run ends at the first');
    assert.deepEqual(h.state().evaluations.map((e) => [e.uid, e.error]), [['e1', undefined], ['e2', undefined]]);
  }
  const offline = createClient<paths>({
    baseUrl: 'http://server',
    fetch: async () => {
      throw new TypeError('offline');
    },
  });
  let state: EvaluationsState = reduce(EMPTY_EVALUATIONS, { type: 'add', evaluation: evaluation('e1') });
  await drainEvaluations(() => state, (a) => (state = reduce(state, a)), (e) => sendEvaluation(offline, e));
  assert.deepEqual(state.evaluations.map((e) => e.error), [undefined]);
});

test('an evaluation the server refuses is marked failed with its message, and the next one still goes', async () => {
  const h = harness((c) => (c.path.endsWith('/bad/') ? json(400, { scores: ['A rating goes from 1 to 5'] }) : saved()));
  h.dispatch({ type: 'add', evaluation: evaluation('bad') });
  h.dispatch({ type: 'add', evaluation: evaluation('good') });
  await h.run();
  assert.deepEqual(h.state().evaluations.map((e) => [e.uid, Boolean(e.error), e.gone]), [['bad', true, undefined]]);
});

test('410 marks it gone: the server deleted it while the change waited', async () => {
  const h = harness(() => json(410, { detail: 'This evaluation was deleted' }));
  h.dispatch({ type: 'add', evaluation: evaluation('e1') });
  await h.run();
  assert.deepEqual(h.state().evaluations.map((e) => [e.uid, e.gone, e.error]), [['e1', true, 'This evaluation was deleted']]);
});

test('retrying sends a failed one again, and a gone one as a new evaluation under a new uid', () => {
  let n = 0;
  let s = reduce(EMPTY_EVALUATIONS, { type: 'add', evaluation: evaluation('a') });
  s = reduce(s, { type: 'add', evaluation: evaluation('b') });
  s = reduce(s, { type: 'failed', uid: 'a', error: 'no' });
  s = reduce(s, { type: 'failed', uid: 'b', error: 'gone', gone: true });
  s = reduce(s, { type: 'retryFailed', fresh: () => `new${++n}` });
  assert.deepEqual(s.evaluations.map((e) => [e.uid, e.error, e.gone]), [['a', undefined, undefined], ['new1', undefined, undefined]]);
});

test('discarding drops the failed ones only', () => {
  let s = reduce(EMPTY_EVALUATIONS, { type: 'add', evaluation: evaluation('a') });
  s = reduce(s, { type: 'add', evaluation: evaluation('b') });
  s = reduce(s, { type: 'failed', uid: 'a', error: 'no' });
  assert.deepEqual(reduce(s, { type: 'discardFailed' }).evaluations.map((e) => e.uid), ['b']);
});

test('adding the same uid again replaces a queued evaluation as a whole and clears its error', () => {
  let s = reduce(EMPTY_EVALUATIONS, { type: 'add', evaluation: evaluation('a', { comment: 'one' }) });
  s = reduce(s, { type: 'failed', uid: 'a', error: 'no' });
  s = reduce(s, { type: 'add', evaluation: evaluation('a', { comment: 'two' }) });
  assert.deepEqual(s.evaluations.map((e) => [e.uid, e.comment, e.error]), [['a', 'two', undefined]]);
});

test('the queued ones about an archer, and the clips they name', () => {
  let s = reduce(EMPTY_EVALUATIONS, { type: 'add', evaluation: evaluation('a') });
  s = reduce(s, { type: 'add', evaluation: evaluation('b', { archer: 8, scores: [{ criterion: 'x', rating: 2, media: 'm9' }] }) });
  assert.deepEqual(pendingEvaluations(s, 8).map((e) => e.uid), ['b']);
  assert.deepEqual(evidenceOf(s.evaluations[1]!), ['m9']);
});
