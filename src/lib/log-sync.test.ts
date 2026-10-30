import assert from 'node:assert/strict';
import { test } from 'vitest';

import createClient from 'openapi-fetch';

import type { paths } from './api-types.ts';
import { drain, pull, send, waitsForEquipment } from './log-sync.ts';
import { EMPTY_LOG, gearFor, reduce, type LogAction, type LogEnd, type LogSession, type LogState } from './log-model.ts';

type Call = { method: string; path: string; search: string; body: unknown };
type Handler = (call: Call, n: number) => Response | Promise<Response>;

const json = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const noContent = () => new Response(null, { status: 204 });

/** A log, and an API client whose "server" is the given handler. */
function harness(handler: Handler) {
  let state: LogState = EMPTY_LOG;
  const dispatch = (a: LogAction) => (state = reduce(state, a));
  const calls: Call[] = [];
  const api = createClient<paths>({
    baseUrl: 'http://server',
    fetch: async (request: Request) => {
      const text = await request.clone().text();
      const call = { method: request.method, path: new URL(request.url).pathname, search: new URL(request.url).search, body: text ? JSON.parse(text) : null };
      calls.push(call);
      return handler(call, calls.length);
    },
  });
  const run = () => drain(() => state, dispatch, (s, op) => send(api, s, op));
  return { api, dispatch, calls, run, state: () => state, queued: () => state.outbox.map((o) => `${o.kind}${o.delete ? '-delete' : ''}${o.error ? '!' : ''}`) };
}

const apiOf = (h: { api: ReturnType<typeof createClient<paths>> }) => h.api;
const ok = (call: Call) => (call.method === 'DELETE' ? noContent() : json(200));
const session: LogSession = {
  id: 's1', started_at: '2026-10-18T09:00:00Z', ended_at: null, type: 'scoring', environment: 'indoor', location: 'Hall', ends: [], volume: [],
};
const end = (shots: string[]): LogEnd => ({
  id: 'e1', index: 0, distance_m: '18.0', face: 'wa-40', arrows_per_end: 3,
  shots: shots.map((id, i) => ({ id, value: 10 - i, is_x: false, is_miss: false })),
});

test('a session a coach logs for an archer without an account is created for that archer', async () => {
  const h = harness(ok);
  h.dispatch({ type: 'startSession', session: { ...session, owner: 7, owner_name: 'Max' } });
  h.dispatch({ type: 'startSession', session: { ...session, id: 's2' } });
  await h.run();
  assert.deepEqual(h.calls.map((c) => `${c.path}${c.search}`), ['/api/sessions/s1/?owner=7', '/api/sessions/s2/']);
});

test('uploads in order with the right requests', async () => {
  const h = harness(ok);
  h.dispatch({ type: 'startSession', session });
  h.dispatch({ type: 'saveEnd', sessionId: 's1', end: end(['a', 'b']) });
  h.dispatch({ type: 'saveVolume', sessionId: 's1', entry: { id: 'v1', distance_m: '30.0', arrow_count: 12 } });
  await h.run();
  assert.deepEqual(h.calls.map((c) => `${c.method} ${c.path}`), [
    'PUT /api/sessions/s1/',
    'PUT /api/sessions/s1/ends/e1/',
    'PUT /api/sessions/s1/volume/v1/',
  ]);
  assert.deepEqual(h.calls[0].body, { started_at: '2026-10-18T09:00:00Z', ended_at: null, type: 'scoring', environment: 'indoor', location: 'Hall' });
  assert.deepEqual(h.calls[1].body, {
    index: 0, distance_m: '18.0', face: 'wa-40', arrows_per_end: 3,
    shots: [{ id: 'a', value: 10, is_x: false, is_miss: false, arrow_number: null }, { id: 'b', value: 9, is_x: false, is_miss: false, arrow_number: null }],
  });
  assert.deepEqual(h.calls[2].body, { distance_m: '30.0', arrow_count: 12 });
  assert.deepEqual(h.queued(), []);
});

test('no connection: nothing is lost, and the next run carries on where it stopped', async () => {
  let online = false;
  const h = harness((call) => {
    if (!online) throw new TypeError('network down');
    return ok(call);
  });
  h.dispatch({ type: 'startSession', session });
  h.dispatch({ type: 'saveEnd', sessionId: 's1', end: end(['a']) });
  await h.run();
  assert.deepEqual(h.queued(), ['session', 'end']);
  assert.equal(h.calls.length, 1, 'stops at the first failure');
  online = true;
  await h.run();
  assert.deepEqual(h.queued(), []);
});

for (const status of [500, 503, 401]) {
  test(`a ${status} stops the run and keeps everything queued`, async () => {
    const h = harness(() => json(status, { detail: 'nope' }));
    h.dispatch({ type: 'startSession', session });
    h.dispatch({ type: 'saveEnd', sessionId: 's1', end: end(['a']) });
    await h.run();
    assert.deepEqual(h.queued(), ['session', 'end']);
    assert.equal(h.calls.length, 1);
  });
}

test('an item the server refuses is marked failed and the rest still go up', async () => {
  const h = harness((call) => (call.path.includes('/ends/') ? json(400, { shots: ['More shots than arrows per end'] }) : ok(call)));
  h.dispatch({ type: 'startSession', session });
  h.dispatch({ type: 'saveEnd', sessionId: 's1', end: end(['a']) });
  h.dispatch({ type: 'saveVolume', sessionId: 's1', entry: { id: 'v1', distance_m: '30.0', arrow_count: 12 } });
  await h.run();
  assert.deepEqual(h.queued(), ['end!']);
  assert.match(h.state().outbox[0].error ?? '', /400: More shots than arrows per end/);
  assert.equal(h.calls.length, 3);
  await h.run();
  assert.equal(h.calls.length, 3, 'failed items are not retried until asked');
  h.dispatch({ type: 'retryFailed' });
  await h.run();
  assert.equal(h.calls.length, 4);
});

test('deleting something the server no longer has counts as done', async () => {
  const h = harness((call) => (call.method === 'DELETE' ? json(404, { detail: 'Not found.' }) : ok(call)));
  h.dispatch({ type: 'startSession', session });
  h.dispatch({ type: 'saveEnd', sessionId: 's1', end: end(['a']) });
  await h.run();
  h.dispatch({ type: 'deleteEnd', sessionId: 's1', endId: 'e1' });
  h.dispatch({ type: 'deleteSession', id: 's1' });
  await h.run();
  assert.deepEqual(h.queued(), []);
  assert.deepEqual(h.calls.slice(2).map((c) => `${c.method} ${c.path}`), ['DELETE /api/sessions/s1/']);
});

test('edits made while an item waits are what gets uploaded, in one request', async () => {
  const h = harness(ok);
  h.dispatch({ type: 'startSession', session });
  h.dispatch({ type: 'saveEnd', sessionId: 's1', end: end(['a']) });
  h.dispatch({ type: 'saveEnd', sessionId: 's1', end: end(['a', 'b', 'c']) });
  await h.run();
  const ends = h.calls.filter((c) => c.path.includes('/ends/'));
  assert.equal(ends.length, 1);
  assert.equal((ends[0].body as { shots: unknown[] }).shots.length, 3);
});

test('an edit made during an upload is uploaded again afterwards', async () => {
  let h: ReturnType<typeof harness>;
  h = harness((call, n) => {
    if (call.path.includes('/ends/') && n === 2) h.dispatch({ type: 'saveEnd', sessionId: 's1', end: end(['a', 'b']) });
    return ok(call);
  });
  h.dispatch({ type: 'startSession', session });
  h.dispatch({ type: 'saveEnd', sessionId: 's1', end: end(['a']) });
  await h.run();
  const ends = h.calls.filter((c) => c.path.includes('/ends/'));
  assert.deepEqual(ends.map((c) => (c.body as { shots: unknown[] }).shots.length), [1, 2]);
  assert.deepEqual(h.queued(), []);
});

test('an item that no longer exists locally is dropped instead of sent', async () => {
  const h = harness(ok);
  h.dispatch({ type: 'startSession', session });
  h.dispatch({ type: 'saveEnd', sessionId: 's1', end: end(['a']) });
  h.dispatch({ type: 'load', state: { ...h.state(), sessions: [] } });
  await h.run();
  assert.equal(h.calls.length, 0);
  assert.deepEqual(h.queued(), []);
});

test('plotted shots go up with their position, typed ones with their score', async () => {
  const h = harness(ok);
  h.dispatch({ type: 'startSession', session });
  const plotted = { id: 'p', value: 10, is_x: false, is_miss: false, x: 0.05, y: -0.1, spot: 2 };
  const typed = { id: 't', value: 9, is_x: false, is_miss: false };
  h.dispatch({ type: 'saveEnd', sessionId: 's1', end: { ...end([]), shots: [plotted, typed] } });
  await h.run();
  assert.deepEqual((h.calls[1].body as { shots: unknown[] }).shots, [
    { id: 'p', x: 0.05, y: -0.1, spot: 2, value: 10, is_x: false, is_miss: false, arrow_number: null },
    { id: 't', value: 9, is_x: false, is_miss: false, arrow_number: null },
  ]);
});

test('the number of an arrow goes up with it', async () => {
  const h = harness(ok);
  h.dispatch({ type: 'startSession', session });
  h.dispatch({ type: 'saveEnd', sessionId: 's1', end: { ...end([]), shots: [{ id: 'n', value: 9, is_x: false, is_miss: false, arrow_number: 4 }] } });
  await h.run();
  assert.equal((h.calls[1].body as { shots: { arrow_number: number | null }[] }).shots[0]!.arrow_number, 4);
});

const equipment = {
  bows: [{ key: '1', id: 1, name: 'Hoyt', type: 'recurve', revision: 11, revision_number: 2 }],
  arrowSets: [{ key: '5', id: 5, name: 'X10', revision: 21, revision_number: 3, count: 12 }],
};
// Equipment made on the phone: no integer ids, but uids.
const madeOnThePhone = {
  bows: [{ key: 'b', id: null, name: 'New', type: 'recurve', revision: null, revision_uid: 'rb', revision_number: 1 }],
  arrowSets: [{ key: 'a', id: null, name: 'Fresh', revision: null, revision_uid: 'ra', revision_number: 1, count: null }],
};

test('the session is uploaded with the revisions of its equipment', async () => {
  const h = harness(ok);
  h.dispatch({ type: 'startSession', session: { ...session, gear: gearFor(equipment, '1', '5') } });
  await h.run();
  assert.deepEqual(h.calls[0].body, {
    started_at: '2026-10-18T09:00:00Z', ended_at: null, type: 'scoring', environment: 'indoor', location: 'Hall',
    bow_revision: 11, arrow_set_revision: 21,
  });
});

test('a session without a choice leaves the equipment out, and "none" clears it', async () => {
  const none = harness(ok);
  none.dispatch({ type: 'startSession', session });
  await none.run();
  assert.ok(!('bow_revision' in (none.calls[0].body as object)));

  const cleared = harness(ok);
  cleared.dispatch({ type: 'startSession', session: { ...session, gear: null } });
  await cleared.run();
  assert.deepEqual(
    [(cleared.calls[0].body as any).bow_revision, (cleared.calls[0].body as any).arrow_set_revision],
    [null, null],
  );
});

test('changing the equipment later uploads the session again', async () => {
  const h = harness(ok);
  h.dispatch({ type: 'startSession', session: { ...session, gear: gearFor(equipment, '1', null) } });
  await h.run();
  h.dispatch({ type: 'updateSession', id: 's1', patch: { gear: gearFor(equipment, '1', '5') } });
  await h.run();
  assert.equal(h.calls.length, 2);
  assert.deepEqual([(h.calls[1].body as any).bow_revision, (h.calls[1].body as any).arrow_set_revision], [11, 21]);
});

test('uploads can be paused: nothing is sent while the stop signal is on, the queue stays', async () => {
  const h = harness(ok);
  h.dispatch({ type: 'startSession', session });
  h.dispatch({ type: 'saveEnd', sessionId: 's1', end: end(['a']) });
  await drain(() => h.state(), h.dispatch, (s, op) => send(h.api, s, op), () => true);
  assert.equal(h.calls.length, 0);
  assert.deepEqual(h.queued(), ['session', 'end']);
});

test('a pause that starts in the middle stops after the item being sent', async () => {
  let paused = false;
  const h = harness((call, n) => {
    if (n === 1) paused = true; // the pause begins while the first item is on its way
    return ok(call);
  });
  h.dispatch({ type: 'startSession', session });
  h.dispatch({ type: 'saveEnd', sessionId: 's1', end: end(['a']) });
  await drain(() => h.state(), h.dispatch, (state, op) => send(apiOf(h), state, op), () => paused);
  assert.equal(h.calls.length, 1);
  assert.deepEqual(h.queued(), ['end'], 'the finished item left the queue, the rest waits');
});

// --- merged and deleted sessions, pulling --------------------------------------------------------

test('a session PUT answered with another id means the server merged it', async () => {
  const h = harness(() => json(200, { id: 'winner' }));
  h.dispatch({ type: 'startSession', session });
  await h.run();
  assert.deepEqual(h.state().sessions.map((s) => s.id), ['winner']);
  assert.deepEqual(h.queued(), []);
});

test('the ends queued under the merged id go to the winner', async () => {
  const h = harness((call) => (call.path === '/api/sessions/s1/' ? json(200, { id: 'winner' }) : ok(call)));
  h.dispatch({ type: 'startSession', session });
  h.dispatch({ type: 'saveEnd', sessionId: 's1', end: end(['a']) });
  await h.run();
  assert.deepEqual(h.calls.map((c) => c.path), ['/api/sessions/s1/', '/api/sessions/winner/ends/e1/']);
  assert.deepEqual(h.queued(), []);
});

test('410 on a session PUT drops the session', async () => {
  const h = harness(() => json(410, { detail: 'gone' }));
  h.dispatch({ type: 'startSession', session });
  await h.run();
  assert.deepEqual(h.state().sessions, []);
  assert.deepEqual(h.queued(), []);
});

test('410 on a session PUT keeps the session when ends of it were not uploaded', async () => {
  const h = harness(() => json(410, { detail: 'gone' }));
  h.dispatch({ type: 'startSession', session });
  h.dispatch({ type: 'saveEnd', sessionId: 's1', end: end(['a', 'b']) });
  await h.run();
  assert.deepEqual(h.state().sessions.map((s) => [s.id, s.gone, s.ends.length]), [['s1', true, 1]]);
  assert.deepEqual(h.queued(), []);
  assert.equal(h.calls.length, 1); // nothing more is sent for it
});

const summary = (id: string, extra = {}) => ({
  id, owner: 7, owner_name: 'Me', opened_by: 3, opened_by_name: 'Coach', started_at: '2026-10-18T09:00:00Z', ended_at: null, type: '', environment: '', location: 'Hall',
  updated_at: '2026-10-18T09:05:00Z', ends: 0, scored_arrows: 0, score_total: 0, volume_arrows: 0, ...extra,
});

const detail = (id: string, extra = {}) => ({
  ...summary(id), weather: '', goals: '', notes: '', physical_rating: null, mental_rating: null, setup_info: null, ends: [], volume_entries: [], ...extra,
});
const serverEnd = { id: 'e1', index: 0, distance_m: '18', face: '40cm', arrows_per_end: 3, shots: [{ id: 'x1', value: 9, is_x: false, is_miss: false }] };

test('pull turns the list and the tombstones into actions', async () => {
  const h = harness((call) => {
    if (call.path === '/api/sessions/gone/') return json(200, [{ id: 'old', owner: 7, merged_into: 'new', at: '2026-10-18T10:00:00Z' }, { id: 'dead', owner: 7, merged_into: null, at: '2026-10-18T09:30:00Z' }]);
    if (call.path === '/api/sessions/') return json(200, [summary('open1'), summary('mine', { opened_by: 7, updated_at: '2026-10-18T09:10:00Z' }), summary('queued')]);
    if (call.path === '/api/sessions/open1/') return json(200, detail('open1', { goals: 'anchor', mental_rating: 4 }));
    return json(200, detail('mine', { opened_by: 7, type: 'scoring', ends: [serverEnd], updated_at: '2026-10-18T09:10:00Z' }));
  });
  const actions = await pull(apiOf(h), 7, '2026-10-17T00:00:00Z', new Set(['queued']));
  assert.ok(actions);
  assert.match(h.calls[0].search + h.calls[1].search, /updated_after=2026-10-17/);
  assert.deepEqual(actions.slice(0, 2), [{ type: 'replaceSessionId', from: 'old', to: 'new' }, { type: 'sessionGone', id: 'dead' }]);
  const pulled = actions[2];
  assert.equal(pulled.type, 'pulled');
  if (pulled.type !== 'pulled') return;
  // All sessions of mine with their results, oldest change first; the one with a queued delete is not fetched.
  assert.deepEqual(pulled.sessions.map((s) => [s.id, s.type, s.keep, s.opened_by_name, s.details?.goals, s.ends.length]), [
    ['open1', '', true, 'Coach', 'anchor', 0],
    ['mine', 'scoring', true, 'Coach', undefined, 1],
  ]);
  assert.equal(pulled.sessions[1].owner_name, undefined);
  assert.equal(pulled.sessions[1].ends[0].shots[0].value, 9);
  assert.equal(pulled.lastPull, '2026-10-18T10:00:00Z');
});

test('a pull that breaks off keeps what it got and goes on from there next time', async () => {
  const h = harness((call) => {
    if (call.path === '/api/sessions/gone/') return json(200, []);
    if (call.path === '/api/sessions/') return json(200, [summary('a', { updated_at: '2026-10-18T09:01:00Z' }), summary('b', { updated_at: '2026-10-18T09:02:00Z' })]);
    if (call.path === '/api/sessions/a/') return json(200, detail('a', { updated_at: '2026-10-18T09:01:00Z' }));
    return json(500);
  });
  const actions = await pull(apiOf(h), 7);
  assert.ok(actions);
  const pulled = actions[0];
  assert.equal(pulled.type, 'pulled');
  if (pulled.type !== 'pulled') return;
  assert.deepEqual(pulled.sessions.map((s) => s.id), ['a']);
  assert.equal(pulled.lastPull, '2026-10-18T09:01:00Z');
});

test('pull gives nothing when the server cannot be reached', async () => {
  const h = harness(() => json(500));
  assert.equal(await pull(apiOf(h), 7), null);
});

test('equipment made on the phone is named by the uids of its revisions', async () => {
  const h = harness(ok);
  h.dispatch({ type: 'startSession', session: { ...session, gear: gearFor(madeOnThePhone, 'b', 'a') } });
  await h.run();
  assert.deepEqual(h.calls[0].body, {
    started_at: '2026-10-18T09:00:00Z', ended_at: null, type: 'scoring', environment: 'indoor', location: 'Hall',
    bow_revision_uid: 'rb', arrow_set_revision_uid: 'ra',
  });
});

test('a session waits for equipment the server has not seen yet, and then the whole queue goes on', () => {
  const state = reduce(EMPTY_LOG, { type: 'startSession', session: { ...session, gear: gearFor(madeOnThePhone, 'b', null) } });
  const op = state.outbox[0];
  assert.equal(waitsForEquipment(state, op, (uid) => uid === 'rb'), true);
  assert.equal(waitsForEquipment(state, op, () => false), false);
  const without = reduce(EMPTY_LOG, { type: 'startSession', session });
  assert.equal(waitsForEquipment(without, without.outbox[0], () => true), false, 'no equipment: nothing to wait for');
});
