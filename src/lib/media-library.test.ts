import assert from 'node:assert/strict';
import { test } from 'vitest';

import type { ApiClient } from './auth-session.ts';
import { EMPTY_LIBRARY, type KnownMedia, missingThumbnails, pullMedia, reduceLibrary, withoutLinks } from './media-library.ts';

const media = (id: string, takenAt: string, extra: Partial<KnownMedia> = {}): KnownMedia => ({
  id, owner: 7, owner_name: 'Me', uploaded_by: 7, uploaded_by_name: 'Me', session: null, event: '', event_info: null, kind: 'photo', taken_at: takenAt,
  width: 100, height: 100, size: 10, created_at: takenAt, updated_at: takenAt, can_edit: true, ...extra,
});

test('a pull adds new items and replaces changed ones, newest first', () => {
  let s = reduceLibrary(EMPTY_LIBRARY, { type: 'pulled', changed: [media('a', '2026-10-01T10:00:00Z'), media('b', '2026-10-02T10:00:00Z')], gone: [], lastPull: 't1' });
  assert.deepEqual(s.items.map((m) => m.id), ['b', 'a']);
  s = reduceLibrary(s, { type: 'pulled', changed: [media('a', '2026-10-01T10:00:00Z', { note: 'slow' }), media('c', '2026-10-03T10:00:00Z')], gone: [], lastPull: 't2' });
  assert.deepEqual(s.items.map((m) => [m.id, m.note]), [['c', undefined], ['b', undefined], ['a', 'slow']]);
  assert.equal(s.lastPull, 't2');
});

test('a pull without a newer time keeps where the last one got to', () => {
  const s = reduceLibrary({ ...EMPTY_LIBRARY, lastPull: 't1' }, { type: 'pulled', changed: [], gone: [] });
  assert.equal(s.lastPull, 't1');
});

test('deleted items leave the list and the thumbnails', () => {
  let s = reduceLibrary(EMPTY_LIBRARY, { type: 'pulled', changed: [media('a', '2026-10-01T10:00:00Z'), media('b', '2026-10-02T10:00:00Z')], gone: [] });
  s = reduceLibrary(reduceLibrary(s, { type: 'thumbnailSaved', id: 'a' }), { type: 'thumbnailSaved', id: 'b' });
  s = reduceLibrary(s, { type: 'pulled', changed: [], gone: ['a', 'unknown'] });
  assert.deepEqual(s.items.map((m) => m.id), ['b']);
  assert.deepEqual(s.cached, ['b']);
});

test('a thumbnail is counted once and only for an item that is there', () => {
  let s = reduceLibrary(EMPTY_LIBRARY, { type: 'pulled', changed: [media('a', '2026-10-01T10:00:00Z'), media('b', '2026-10-02T10:00:00Z')], gone: [] });
  assert.deepEqual(missingThumbnails(s).map((m) => m.id), ['b', 'a']);
  s = reduceLibrary(reduceLibrary(s, { type: 'thumbnailSaved', id: 'a' }), { type: 'thumbnailSaved', id: 'a' });
  assert.deepEqual(s.cached, ['a']);
  assert.deepEqual(missingThumbnails(s).map((m) => m.id), ['b']);
  assert.equal(reduceLibrary(s, { type: 'thumbnailSaved', id: 'ghost' }), s);
});

test('clear forgets everything', () => {
  const s = reduceLibrary(EMPTY_LIBRARY, { type: 'pulled', changed: [media('a', '2026-10-01T10:00:00Z')], gone: [], lastPull: 't' });
  assert.deepEqual(reduceLibrary(s, { type: 'clear' }), EMPTY_LIBRARY);
});

test('the links are left out, they run out after an hour', () => {
  const kept = withoutLinks({ ...media('a', '2026-10-01T10:00:00Z'), file_url: 'https://x/f', thumbnail_url: 'https://x/t' });
  assert.equal('file_url' in kept, false);
  assert.equal('thumbnail_url' in kept, false);
});

// --- pulling -------------------------------------------------------------------------------------

type Call = { path: string; query: Record<string, unknown> };

function apiOf(answer: (call: Call) => unknown | null) {
  const calls: Call[] = [];
  const api = {
    GET: async (path: string, init: { params: { query: Record<string, unknown> } }) => {
      const call = { path, query: init.params.query };
      calls.push(call);
      const data = answer(call);
      return data === null ? { data: undefined } : { data };
    },
  } as unknown as ApiClient;
  return { api, calls };
}

test('pull asks for your media and the deleted ones since the last time', async () => {
  const { api, calls } = apiOf((call) =>
    call.path === '/api/media/'
      ? [{ ...media('a', '2026-10-01T10:00:00Z'), updated_at: '2026-10-05T10:00:00Z', file_url: 'f', thumbnail_url: 't' }]
      : [{ kind: 'media', uid: 'dead', at: '2026-10-06T10:00:00Z' }],
  );
  const result = await pullMedia(api, 7, '2026-10-04T00:00:00Z');
  assert.ok(result);
  assert.deepEqual(calls.map((c) => [c.path, c.query]), [
    ['/api/media/', { owner: 7, updated_after: '2026-10-04T00:00:00Z' }],
    ['/api/gone/', { kind: 'media', updated_after: '2026-10-04T00:00:00Z' }],
  ]);
  assert.deepEqual(result.changed.map((m) => m.id), ['a']);
  assert.deepEqual(result.gone, ['dead']);
  assert.equal(result.lastPull, '2026-10-06T10:00:00Z');
});

test('the first pull asks for everything', async () => {
  const { api, calls } = apiOf(() => []);
  const result = await pullMedia(api, 7);
  assert.deepEqual(calls[0].query, { owner: 7 });
  assert.deepEqual(result, { changed: [], gone: [], lastPull: undefined });
});

test('pull gives nothing when the server cannot be reached', async () => {
  assert.equal(await pullMedia(apiOf(() => null).api, 7), null);
  const failing = { GET: async () => { throw new Error('offline'); } } as unknown as ApiClient;
  assert.equal(await pullMedia(failing, 7), null);
});
