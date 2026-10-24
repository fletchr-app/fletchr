import assert from 'node:assert/strict';
import createClient from 'openapi-fetch';
import { test } from 'vitest';

import type { paths } from './api-types.ts';
import { drainMedia, mediaForm, type MediaSendResult, type QueuedMedia, sendMedia } from './media-queue.ts';

const item = (id: string, extra: Partial<QueuedMedia> = {}): QueuedMedia => ({
  id, kind: 'photo', owner: null, session: null, taken_at: '2026-10-24T10:00:00Z', width: 800, height: 600, ...extra,
});
const files = { file: new Blob(['jpeg'], { type: 'image/jpeg' }), thumbnail: new Blob(['t'], { type: 'image/jpeg' }) };

/** A queue and the things drainMedia reports. */
function harness(results: Record<string, MediaSendResult[]>, start: QueuedMedia[], blocked: (i: QueuedMedia) => boolean = () => false) {
  let queue = start;
  const log: string[] = [];
  const run = () =>
    drainMedia({
      items: () => queue,
      done: (id) => ((queue = queue.filter((i) => i.id !== id)), log.push(`done ${id}`)),
      fail: (id, message) => ((queue = queue.map((i) => (i.id === id ? { ...i, error: message } : i))), log.push(`fail ${id}`)),
      dropSession: (id) => ((queue = queue.map((i) => (i.id === id ? { ...i, session: null } : i))), log.push(`drop ${id}`)),
      send: async (i) => (results[i.id] ?? [{ kind: 'ok' }]).shift()!,
      blocked,
    });
  return { run, log, queue: () => queue };
}

test('the form carries the clip, the preview and what is known about it', () => {
  const form = mediaForm(item('a', { kind: 'video', session: 's1', duration_ms: 8000, capture_fps: 120, frame_count: 872 }), files, true);
  assert.equal(form.get('kind'), 'video');
  assert.equal(form.get('session'), 's1');
  assert.equal(form.get('duration_ms'), '8000');
  assert.equal(form.get('capture_fps'), '120');
  assert.equal((form.get('file') as File).name, 'a.mp4');
  assert.equal((form.get('thumbnail') as File).name, 'a-thumb.jpg');
  assert.equal(mediaForm(item('b'), files, true).has('duration_ms'), false);
  assert.equal(mediaForm(item('b', { session: 's1' }), files, false).has('session'), false);
});

test('what the server takes leaves the queue, oldest first', async () => {
  const h = harness({}, [item('a'), item('b')]);
  await h.run();
  assert.deepEqual(h.log, ['done a', 'done b']);
  assert.deepEqual(h.queue(), []);
});

test('no connection ends the run and keeps everything', async () => {
  const h = harness({ a: [{ kind: 'retry' }] }, [item('a'), item('b')]);
  await h.run();
  assert.deepEqual(h.log, []);
  assert.equal(h.queue().length, 2);
});

test('a refused item is marked and the next one goes on', async () => {
  const h = harness({ a: [{ kind: 'failed', message: '400: too long' }] }, [item('a'), item('b')]);
  await h.run();
  assert.deepEqual(h.log, ['fail a', 'done b']);
  assert.equal(h.queue()[0]!.error, '400: too long');
  await h.run();
  assert.deepEqual(h.log, ['fail a', 'done b'], 'a refused item is not tried again by itself');
});

test('an item whose session is still on its way is passed over, not lost', async () => {
  const h = harness({}, [item('a', { session: 's1' }), item('b')], (i) => i.session === 's1');
  await h.run();
  assert.deepEqual(h.log, ['done b']);
  assert.equal(h.queue()[0]!.id, 'a');
});

test('a session the server does not know is dropped and the clip goes up without it', async () => {
  const h = harness({ a: [{ kind: 'withoutSession' }, { kind: 'ok' }] }, [item('a', { session: 's1' })]);
  await h.run();
  assert.deepEqual(h.log, ['drop a', 'done a']);
});

test('stop pauses before the next item', async () => {
  let queue = [item('a'), item('b')];
  const sent: string[] = [];
  await drainMedia({
    items: () => queue,
    done: (id) => (queue = queue.filter((i) => i.id !== id)),
    fail: () => {},
    dropSession: () => {},
    send: async (i) => (sent.push(i.id), { kind: 'ok' }),
    stop: () => sent.length === 1,
  });
  assert.deepEqual(sent, ['a']);
});

// --- against the API client ---

type Call = { method: string; url: string; type: string | null; form: FormData | null };

function clientWith(respond: (call: Call) => Response) {
  const calls: Call[] = [];
  const api = createClient<paths>({
    baseUrl: 'http://server',
    fetch: async (request: Request) => {
      const type = request.headers.get('content-type');
      const form = type?.startsWith('multipart/form-data') ? await request.clone().formData() : null;
      const call = { method: request.method, url: request.url, type, form };
      calls.push(call);
      return respond(call);
    },
  });
  return { api, calls };
}
const json = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

test('it is sent as a multipart PUT to the id of the clip, with the archer in the address', async () => {
  const { api, calls } = clientWith(() => json(201));
  const result = await sendMedia(api, item('a', { owner: 7, session: 's1' }), files);
  assert.deepEqual(result, { kind: 'ok' });
  assert.equal(calls[0]!.method, 'PUT');
  assert.equal(calls[0]!.url, 'http://server/api/media/a/?owner=7');
  assert.match(calls[0]!.type!, /^multipart\/form-data; boundary=/);
  assert.equal(calls[0]!.form!.get('session'), 's1');
  assert.equal(await (calls[0]!.form!.get('file') as File).text(), 'jpeg');
});

test('yourself: no archer in the address', async () => {
  const { api, calls } = clientWith(() => json(200));
  await sendMedia(api, item('a'), files);
  assert.equal(calls[0]!.url, 'http://server/api/media/a/');
});

test('server errors and being signed out are tried again; other refusals are not', async () => {
  const status = (code: number, body?: unknown) => sendMedia(clientWith(() => json(code, body)).api, item('a'), files);
  assert.equal((await status(500)).kind, 'retry');
  assert.equal((await status(401)).kind, 'retry');
  const refused = await status(400, { file: ['A video must be an MP4 file'] });
  assert.equal(refused.kind, 'failed');
  assert.match((refused as { message: string }).message, /^400: /);
  const offline = createClient<paths>({ baseUrl: 'http://server', fetch: async () => Promise.reject(new TypeError('offline')) });
  assert.equal((await sendMedia(offline, item('a'), files)).kind, 'retry');
});

test('a 400 about the session means: send it without', async () => {
  const bad = clientWith(() => json(400, { session: ['Invalid pk'] })).api;
  assert.equal((await sendMedia(bad, item('a', { session: 's1' }), files)).kind, 'withoutSession');
  assert.equal((await sendMedia(bad, item('a'), files)).kind, 'failed', 'no session was sent, so it cannot be the cause');
});
