import assert from 'node:assert/strict';
import createClient from 'openapi-fetch';
import { test } from 'vitest';

import type { paths } from './api-types.ts';
import { drainNotes, sendNote } from './note-sync.ts';
import { EMPTY_NOTES, type NoteAction, type NotesState, type QueuedNote, reduce } from './note-store.ts';

type Call = { method: string; path: string; body: unknown };
const json = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function harness(handler: (call: Call) => Response, blocked: (n: QueuedNote) => boolean = () => false) {
  let state: NotesState = EMPTY_NOTES;
  const dispatch = (a: NoteAction) => (state = reduce(state, a));
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
  const run = () => drainNotes(() => state, dispatch, (n) => sendNote(api, n), blocked);
  return { dispatch, calls, run, state: () => state };
}

const note = (uid: string, extra: Partial<QueuedNote> = {}): QueuedNote => ({
  uid, archer: 7, team: 1, body: 'Watch the bow arm', visibility: 'coach_only', session: 's1', end: null, media: null, frame: null, time_ms: null,
  drawing: null, created_at: 'n', ...extra,
});
const created = () => json(201, { id: 5, uid: 'x' });

test('a note goes up by its uid with everything it is about', async () => {
  const h = harness(created);
  h.dispatch({ type: 'add', note: note('n1', { media: 'm1', frame: 3, time_ms: 1200, drawing: { v: 1, shapes: [{ t: 'line', p: [[0.1, 0.2], [0.3, 0.4]] }] } }) });
  await h.run();
  assert.deepEqual(h.calls.map((c) => `${c.method} ${c.path}`), ['PUT /api/notes/n1/']);
  assert.deepEqual(h.calls[0].body, {
    archer: 7, team: 1, body: 'Watch the bow arm', visibility: 'coach_only', session: 's1', end: null, media: 'm1', frame: 3, time_ms: 1200,
    drawing: { v: 1, shapes: [{ t: 'line', p: [[0.1, 0.2], [0.3, 0.4]] }] },
  });
  assert.equal(h.state().notes.length, 0);
});

test('a note about yourself goes up without a team', async () => {
  const h = harness(created);
  h.dispatch({ type: 'add', note: note('n1', { team: null, visibility: 'private' }) });
  await h.run();
  assert.equal((h.calls[0].body as { team: unknown }).team, null);
});

test('a note whose photo or session is still waiting is passed over, and the others go', async () => {
  const h = harness(created, (n) => n.media === 'm1');
  h.dispatch({ type: 'add', note: note('wait', { media: 'm1' }) });
  h.dispatch({ type: 'add', note: note('go') });
  await h.run();
  assert.deepEqual(h.calls.map((c) => c.path), ['/api/notes/go/']);
  assert.deepEqual(h.state().notes.map((n) => n.uid), ['wait']);
});

test('no connection or a server error leaves everything queued and ends the run', async () => {
  for (const handler of [() => json(503), () => json(401), (): Response => { throw new TypeError('offline'); }]) {
    const h = harness(handler);
    h.dispatch({ type: 'add', note: note('a') });
    h.dispatch({ type: 'add', note: note('b') });
    await h.run();
    assert.deepEqual(h.state().notes.map((n) => [n.uid, n.error]), [['a', undefined], ['b', undefined]]);
    assert.equal(h.calls.length <= 1, true);
  }
});

test('a note the server refuses is marked failed with its reason and the next one still goes up', async () => {
  const h = harness((call) => (call.path === '/api/notes/a/' ? json(400, { media: ['Invalid pk "m1" - object does not exist.'] }) : created()));
  h.dispatch({ type: 'add', note: note('a') });
  h.dispatch({ type: 'add', note: note('b') });
  await h.run();
  assert.deepEqual(h.state().notes.map((n) => [n.uid, !!n.error]), [['a', true]]);
});

test('a note from somebody who may not write it stays failed', async () => {
  const h = harness(() => json(403, { detail: 'Only coaches can write notes' }));
  h.dispatch({ type: 'add', note: note('a') });
  await h.run();
  assert.match(h.state().notes[0].error ?? '', /coaches/);
});
