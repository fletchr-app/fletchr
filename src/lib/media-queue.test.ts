import assert from 'node:assert/strict';
import createClient from 'openapi-fetch';
import { test } from 'vitest';

import type { paths } from './api-types.ts';
import { afterUpload, drainMedia, mediaForm, type MediaSendResult, moveQueued, type QueuedMedia, renameSession, sendMedia } from './media-queue.ts';

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
      done: (sent) => ((queue = afterUpload(queue, sent)), log.push(`done ${sent.id}`)),
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
    done: (sent) => (queue = afterUpload(queue, sent)),
    fail: () => {},
    dropSession: () => {},
    send: async (i) => (sent.push(i.id), { kind: 'ok' }),
    stop: () => sent.length === 1,
  });
  assert.deepEqual(sent, ['a']);
});

test('moveQueued changes the session of the chosen items only', () => {
  const moved = moveQueued([item('a'), item('b', { session: 's1' }), item('c')], ['a', 'b'], 's2');
  assert.deepEqual(moved.map((i) => i.session), ['s2', 's2', null]);
  assert.equal(moveQueued([item('a', { session: 's1' })], ['a'], null)[0]!.session, null);
});

test('afterUpload removes an item that stayed as it was sent', () => {
  assert.deepEqual(afterUpload([item('a', { session: 's1' }), item('b')], item('a', { session: 's1' })).map((i) => i.id), ['b']);
});

test('afterUpload keeps an item that was moved while it was uploading, as one that only needs its session sent', () => {
  const after = afterUpload([item('a', { session: 's2' })], item('a', { session: 's1' }));
  assert.deepEqual(after, [item('a', { session: 's2', uploaded: true })]);
  assert.equal(afterUpload([item('a', { session: null })], item('a', { session: 's1' }))[0]!.uploaded, true, 'taken out of the session');
  assert.deepEqual(afterUpload(afterUpload([item('a', { session: 's2' })], item('a', { session: 's1' })), item('a', { session: 's2', uploaded: true })), [], 'sent, and it is done');
});

test('afterUpload ignores an item that was removed meanwhile', () => {
  const rest = [item('b')];
  assert.equal(afterUpload(rest, item('a')), rest);
});

test('the form of an uploaded item has the session and the note, and no files', () => {
  const form = mediaForm(item('a', { session: 's2', uploaded: true, note: 'x' }), null, true);
  assert.deepEqual([...form.keys()].sort(), ['note', 'session']);
  assert.equal(form.get('session'), 's2');
  assert.equal(mediaForm(item('a', { uploaded: true }), null, true).get('session'), '', 'no session: the server clears it');
  assert.equal(mediaForm(item('a', { session: 's1', uploaded: true }), null, false).get('session'), '', 'a session that is gone');
});

test('a clip moved while it uploads gets a second, session-only request', async () => {
  let queue = [item('a', { session: 's1' })];
  const forms: string[][] = [];
  const run = () =>
    drainMedia({
      items: () => queue,
      done: (sent) => (queue = afterUpload(queue, sent)),
      fail: () => {},
      dropSession: () => {},
      send: async (i) => {
        forms.push([...mediaForm(i, i.uploaded ? null : files, true).keys()]);
        if (!i.uploaded) queue = moveQueued(queue, ['a'], 's2'); // moved while the request runs
        return { kind: 'ok' };
      },
    });
  await run(); // the moved item stays after the first request and goes again in the same run
  assert.deepEqual(queue, []);
  assert.deepEqual(forms.map((f) => f.includes('file')), [true, false]);
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

test('queued clips follow a session that the server merged into another', () => {
  const items = [item('a', { session: 'old' }), item('b', { session: 'other' }), item('c')];
  assert.deepEqual(renameSession(items, 'old', 'new').map((i) => i.session), ['new', 'other', null]);
  assert.equal(renameSession(items, 'missing', 'new'), items);
});

test('an uploaded item sends only the session, and a session that is gone is dropped', async () => {
  const sent = clientWith(() => json(200));
  await sendMedia(sent.api, item('a', { session: 's2', uploaded: true }), null);
  assert.deepEqual([...sent.calls[0]!.form!.keys()], ['session']);
  const bad = clientWith(() => json(400, { session: ['gone'] }));
  assert.equal((await sendMedia(bad.api, item('a', { session: 's2', uploaded: true }), null)).kind, 'withoutSession');
});
