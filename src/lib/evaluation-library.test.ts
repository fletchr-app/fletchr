import assert from 'node:assert/strict';
import createClient from 'openapi-fetch';
import { test } from 'vitest';

import type { paths } from './api-types.ts';
import { EMPTY_EVALUATION_LIBRARY, type EvaluationLibraryAction, isKept, type KnownEvaluation, pullEvaluations, reduceEvaluationLibrary, selectEvaluations } from './evaluation-library.ts';

const evaluation = (id: number, date: string, extra: Partial<KnownEvaluation> = {}): KnownEvaluation => ({
  id, uid: `u${id}`, team: 1, archer: 7, archer_name: 'Me', author: 8, author_name: 'Coach', kind: 'coach', date, comment: '', goals: '', visibility: 'shared', scores: [],
  template_id: 3, template_name: 'Technique', version: 1, scale: 5, criteria: [], can_edit: false, can_delete: false, created_at: `${date}T10:00:00Z`, updated_at: `${date}T10:00:00Z`, ...extra,
});

test('a pull adds new evaluations and replaces changed ones, newest first', () => {
  let s = reduceEvaluationLibrary(EMPTY_EVALUATION_LIBRARY, { type: 'pulled', changed: [evaluation(1, '2026-10-01'), evaluation(2, '2026-10-02')], gone: [], lastPull: 't1' });
  assert.deepEqual(s.evaluations.map((e) => e.id), [2, 1]);
  s = reduceEvaluationLibrary(s, { type: 'pulled', changed: [evaluation(1, '2026-10-01', { comment: 'edited' }), evaluation(3, '2026-10-03')], gone: [], lastPull: 't2' });
  assert.deepEqual(s.evaluations.map((e) => [e.id, e.comment]), [[3, ''], [2, ''], [1, 'edited']]);
  assert.equal(s.lastPull, 't2');
});

test('the same pull applied twice gives the same copy (a pull asks with an overlap)', () => {
  const pull: EvaluationLibraryAction = { type: 'pulled', changed: [evaluation(1, '2026-10-01'), evaluation(2, '2026-10-02')], gone: ['u9'], lastPull: 't1' };
  const once = reduceEvaluationLibrary(EMPTY_EVALUATION_LIBRARY, pull);
  assert.deepEqual(reduceEvaluationLibrary(once, pull), once);
});

test('a deleted or taken back evaluation leaves the copy, an unknown one is ignored', () => {
  let s = reduceEvaluationLibrary(EMPTY_EVALUATION_LIBRARY, { type: 'pulled', changed: [evaluation(1, '2026-10-01'), evaluation(2, '2026-10-02')], gone: [] });
  s = reduceEvaluationLibrary(s, { type: 'pulled', changed: [], gone: ['u1', 'unknown'] });
  assert.deepEqual(s.evaluations.map((e) => e.id), [2]);
  assert.deepEqual(reduceEvaluationLibrary(s, { type: 'forget', uid: 'u2' }).evaluations, []);
});

test('a pull without a newer time keeps where the last one got to', () => {
  const s = reduceEvaluationLibrary({ ...EMPTY_EVALUATION_LIBRARY, lastPull: 't1' }, { type: 'pulled', changed: [], gone: [] });
  assert.equal(s.lastPull, 't1');
});

test('a list that shows nothing new leaves the copy as it is', () => {
  const s = reduceEvaluationLibrary(EMPTY_EVALUATION_LIBRARY, { type: 'saved', evaluations: [evaluation(1, '2026-10-01')] });
  assert.equal(reduceEvaluationLibrary(s, { type: 'saved', evaluations: [evaluation(1, '2026-10-01')] }), s);
});

test('only evaluations about you or by you are kept', () => {
  assert.equal(isKept({ archer: 7, author: 8 }, 7), true);
  assert.equal(isKept({ archer: 9, author: 7 }, 7), true);
  assert.equal(isKept({ archer: 9, author: 8 }, 7), false);
});

test('the copy answers like the server: by archer or by author', () => {
  const s = reduceEvaluationLibrary(EMPTY_EVALUATION_LIBRARY, { type: 'pulled', changed: [evaluation(1, '2026-10-01'), evaluation(2, '2026-10-02', { archer: 9, author: 7 })], gone: [] });
  assert.deepEqual(selectEvaluations(s, { archer: 9 }).map((e) => e.id), [2]);
  assert.deepEqual(selectEvaluations(s, { author: 8 }).map((e) => e.id), [1]);
  assert.deepEqual(selectEvaluations(s).map((e) => e.id), [2, 1]);
});

type Call = { path: string; query: Record<string, string> };
const server = (answer: (call: Call) => unknown, calls: Call[] = []) =>
  createClient<paths>({
    baseUrl: 'http://server',
    fetch: async (request: Request) => {
      const url = new URL(request.url);
      const call = { path: url.pathname, query: Object.fromEntries(url.searchParams) };
      calls.push(call);
      const body = answer(call);
      return new Response(JSON.stringify(body), { status: body === null ? 503 : 200, headers: { 'content-type': 'application/json' } });
    },
  });

test('a pull asks for evaluations about you, by you and the deleted ones, since the last time minus the overlap', async () => {
  const calls: Call[] = [];
  const api = server((call) => {
    if (call.path === '/api/gone/') return [{ kind: 'evaluation', uid: 'u9', at: '2026-10-09T10:00:00Z' }];
    return call.query.archer ? [evaluation(1, '2026-10-01'), evaluation(2, '2026-10-02')] : [evaluation(2, '2026-10-02'), evaluation(3, '2026-10-03', { archer: 8, author: 7 })];
  }, calls);
  const result = await pullEvaluations(api, 7, '2026-09-30T10:00:00Z');
  assert.deepEqual(calls.map((c) => [c.path, c.query]), [
    ['/api/evaluations/', { archer: '7', updated_after: '2026-09-30T09:59:00.000Z' }],
    ['/api/evaluations/', { author: '7', updated_after: '2026-09-30T09:59:00.000Z' }],
    ['/api/gone/', { kind: 'evaluation', updated_after: '2026-09-30T09:59:00.000Z' }],
  ]);
  assert.deepEqual(result?.changed.map((e) => e.id), [1, 2, 3]);
  assert.deepEqual(result?.gone, ['u9']);
  assert.equal(result?.lastPull, '2026-10-09T10:00:00Z');
});

test('a first pull asks for everything, and a failed one keeps nothing', async () => {
  const calls: Call[] = [];
  const api = server(() => [], calls);
  await pullEvaluations(api, 7);
  assert.deepEqual(calls.map((c) => c.query), [{ archer: '7' }, { author: '7' }, { kind: 'evaluation' }]);
  assert.equal(await pullEvaluations(server(() => null), 7), null);
});
