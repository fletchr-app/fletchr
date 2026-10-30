import assert from 'node:assert/strict';
import createClient from 'openapi-fetch';
import { test } from 'vitest';

import type { paths } from './api-types.ts';
import { drainEquipment, pullEquipment, sendEquipment } from './equipment-sync.ts';
import { EMPTY_EQUIPMENT, type EquipmentAction, type EquipmentState, findItem, reduce } from './equipment-store.ts';

type Call = { method: string; path: string; body: unknown };
type Handler = (call: Call) => Response;

const json = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function harness(handler: Handler) {
  let state: EquipmentState = EMPTY_EQUIPMENT;
  const dispatch = (a: EquipmentAction) => (state = reduce(state, a));
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
  const run = () => drainEquipment(() => state, dispatch, (s, op) => sendEquipment(api, s, op));
  return { api, dispatch, calls, run, state: () => state };
}

const saveBow = (uid: string, revisionUid: string, extra = {}): EquipmentAction => ({
  type: 'save', kind: 'bow', uid, values: { name: 'Hoyt', type: 'recurve', draw_weight: '38.0', ...extra }, is_active: true, now: 'n', revisionUid,
});
const accepted = (id: number, revisionUid: string, number = 1) => json(200, { id, uid: 'x', revision_uid: revisionUid, revision_number: number });

test('a new bow goes up by its uid with its values and the uid of its revision', async () => {
  const h = harness(() => accepted(7, 'r1'));
  h.dispatch(saveBow('b1', 'r1'));
  await h.run();
  assert.deepEqual(h.calls.map((c) => `${c.method} ${c.path}`), ['PUT /api/bows/b1/']);
  assert.deepEqual(h.calls[0].body, { name: 'Hoyt', type: 'recurve', draw_weight: '38.0', is_active: true, revision_uid: 'r1' });
  assert.deepEqual([findItem(h.state(), 'bow', 'b1')!.id, h.state().outbox.length], [7, 0]);
});

test('an arrow set goes to its own route', async () => {
  const h = harness(() => accepted(3, 'ra'));
  h.dispatch({ type: 'save', kind: 'arrowSet', uid: 'a1', values: { name: 'X10', count: 12 }, is_active: true, now: 'n', revisionUid: 'ra' });
  await h.run();
  assert.deepEqual(h.calls.map((c) => c.path), ['/api/arrow-sets/a1/']);
});

test('a bow the server has is deleted by its integer id', async () => {
  const h = harness(() => new Response(null, { status: 204 }));
  h.dispatch({ type: 'pulled', items: [{ kind: 'bow', uid: 'b1', id: 7, is_active: true, created_at: '', values: { name: 'Hoyt' }, revision: { uid: 'r1', id: 70, number: 1 } }] });
  h.dispatch({ type: 'remove', kind: 'bow', uid: 'b1' });
  await h.run();
  assert.deepEqual(h.calls.map((c) => `${c.method} ${c.path}`), ['DELETE /api/bows/7/']);
  assert.equal(h.state().outbox.length, 0);
});

test('a delete the server refuses because the bow was used stays failed with its message', async () => {
  const h = harness(() => json(409, { detail: 'This has been used in a session. Deactivate it instead of deleting it.' }));
  h.dispatch({ type: 'pulled', items: [{ kind: 'bow', uid: 'b1', id: 7, is_active: true, created_at: '', values: { name: 'Hoyt' }, revision: { uid: 'r1', id: 70, number: 1 } }] });
  h.dispatch({ type: 'remove', kind: 'bow', uid: 'b1' });
  await h.run();
  assert.match(h.state().outbox[0].error ?? '', /used in a session/);
  assert.deepEqual(h.state().items.map((i) => i.uid), ['b1'], 'the bow is back in the list');
});

test('no connection or a server error leaves everything queued and ends the run', async () => {
  for (const handler of [() => json(503), () => json(401), (): Response => { throw new TypeError('offline'); }]) {
    const h = harness(handler);
    h.dispatch(saveBow('b1', 'r1'));
    h.dispatch(saveBow('b2', 'r2'));
    await h.run();
    assert.deepEqual(h.state().outbox.map((o) => [o.key, o.error]), [['bow:b1', undefined], ['bow:b2', undefined]]);
    assert.equal(h.calls.length <= 1, true, 'the run stops at the first item');
  }
});

test('a refused change is marked failed and the next one still goes up', async () => {
  const h = harness((call) => (call.path === '/api/bows/b1/' ? json(400, { name: ['This field may not be blank.'] }) : accepted(8, 'r2')));
  h.dispatch(saveBow('b1', 'r1'));
  h.dispatch(saveBow('b2', 'r2'));
  await h.run();
  assert.deepEqual(h.state().outbox.map((o) => [o.key, !!o.error]), [['bow:b1', true]]);
  assert.equal(findItem(h.state(), 'bow', 'b2')!.id, 8);
});

test('the pull maps the server list, bows and arrow sets, with the uids of their current revisions', async () => {
  const h = harness((call) =>
    call.path === '/api/bows/'
      ? json(200, [{ id: 7, uid: 'b1', is_active: false, created_at: 'c', revision: 70, revision_number: 2, revision_uid: 'r2', name: 'Hoyt', type: 'recurve', draw_weight: '38.0', riser: '' }])
      : json(200, [{ id: 3, uid: 'a1', is_active: true, created_at: 'c', revision: 30, revision_number: 1, revision_uid: 'ra', name: 'X10', count: 12, spine: '600' }]),
  );
  const items = await pullEquipment(h.api, 5);
  assert.ok(items);
  assert.deepEqual(items.map((i) => [i.kind, i.uid, i.id, i.is_active, i.revision]), [
    ['bow', 'b1', 7, false, { uid: 'r2', id: 70, number: 2 }],
    ['arrowSet', 'a1', 3, true, { uid: 'ra', id: 30, number: 1 }],
  ]);
  assert.equal(items[0].values.draw_weight, '38.0');
  assert.equal(items[0].values.tiller, null, 'a value the server did not send is empty');
  assert.equal(items[1].values.count, 12);
  assert.match(h.calls.map((c) => c.path).join(), /bows.*arrow-sets/);
});

test('the pull gives nothing when the server cannot be reached', async () => {
  assert.equal(await pullEquipment(harness(() => json(500)).api, 5), null);
  assert.equal(await pullEquipment(harness((): Response => { throw new TypeError('offline'); }).api, 5), null);
});
