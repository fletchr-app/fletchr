import assert from 'node:assert/strict';
import { test } from 'vitest';

import createClient from 'openapi-fetch';

import type { paths } from './api-types.ts';
import { drain, fetchEquipment, send } from './log-sync.ts';
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
  bows: [{ id: 1, name: 'Hoyt', type: 'recurve', revision: 11, revision_number: 2 }],
  arrowSets: [{ id: 5, name: 'X10', revision: 21, revision_number: 3, count: 12 }],
};

test('the session is uploaded with the revisions of its equipment', async () => {
  const h = harness(ok);
  h.dispatch({ type: 'startSession', session: { ...session, gear: gearFor(equipment, 1, 5) } });
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
  h.dispatch({ type: 'startSession', session: { ...session, gear: gearFor(equipment, 1, null) } });
  await h.run();
  h.dispatch({ type: 'updateSession', id: 's1', patch: { gear: gearFor(equipment, 1, 5) } });
  await h.run();
  assert.equal(h.calls.length, 2);
  assert.deepEqual([(h.calls[1].body as any).bow_revision, (h.calls[1].body as any).arrow_set_revision], [11, 21]);
});

test('the stored equipment is fetched for active items of the user only', async () => {
  const urls: string[] = [];
  const api = createClient<paths>({
    baseUrl: 'http://server',
    fetch: async (request: Request) => {
      urls.push(request.url);
      return request.url.includes('/bows/')
        ? json(200, [{ id: 1, name: 'Hoyt', type: 'recurve', revision: 11, revision_number: 2, notes: 'not kept' }])
        : json(200, [{ id: 5, name: 'X10', revision: 21, revision_number: 3, count: 12 }]);
    },
  });
  assert.deepEqual(await fetchEquipment(api, 7), equipment);
  assert.equal(urls.length, 2);
  assert.ok(urls.every((u) => u.includes('owner=7') && u.includes('is_active=true')), urls.join(' '));
});

test('no connection or a refusal gives no equipment instead of an error', async () => {
  const down = createClient<paths>({ baseUrl: 'http://server', fetch: async () => { throw new TypeError('offline'); } });
  assert.equal(await fetchEquipment(down, 7), null);
  const refused = createClient<paths>({ baseUrl: 'http://server', fetch: async () => json(403, { detail: 'no' }) });
  assert.equal(await fetchEquipment(refused, 7), null);
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
