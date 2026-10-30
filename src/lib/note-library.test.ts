import assert from 'node:assert/strict';
import { test } from 'vitest';

import type { ApiClient } from './auth-session.ts';
import { EMPTY_NOTE_LIBRARY, isKept, type KnownNote, pullNotes, reduceNoteLibrary, selectNotes, serverQuery } from './note-library.ts';

const note = (uid: string, createdAt: string, extra: Partial<KnownNote> = {}): KnownNote => ({
  id: Number(uid.replace(/\D/g, '')) || 1, uid, author: 9, author_name: 'Coach', archer: 7, archer_name: 'Me', body: 'Watch the bow arm', visibility: 'shared', team: 1,
  picture: null, event_info: null, can_edit: true, can_delete: true, created_at: createdAt, updated_at: createdAt, ...extra,
});

test('a pull adds new notes and replaces changed ones, newest first', () => {
  let s = reduceNoteLibrary(EMPTY_NOTE_LIBRARY, { type: 'pulled', changed: [note('n1', '2026-10-01T10:00:00Z'), note('n2', '2026-10-02T10:00:00Z')], gone: [], lastPull: 't1' });
  assert.deepEqual(s.notes.map((n) => n.uid), ['n2', 'n1']);
  s = reduceNoteLibrary(s, { type: 'pulled', changed: [note('n1', '2026-10-01T10:00:00Z', { body: 'Better' })], gone: [], lastPull: 't2' });
  assert.deepEqual(s.notes.map((n) => [n.uid, n.body]), [['n2', 'Watch the bow arm'], ['n1', 'Better']]);
  assert.equal(s.lastPull, 't2');
});

test('a pull without a newer time keeps where the last one got to', () => {
  const s = reduceNoteLibrary({ ...EMPTY_NOTE_LIBRARY, lastPull: 't1' }, { type: 'pulled', changed: [], gone: [] });
  assert.equal(s.lastPull, 't1');
});

test('deleted notes leave the copy, unknown ones are ignored', () => {
  let s = reduceNoteLibrary(EMPTY_NOTE_LIBRARY, { type: 'pulled', changed: [note('n1', '2026-10-01T10:00:00Z'), note('n2', '2026-10-02T10:00:00Z')], gone: [] });
  s = reduceNoteLibrary(s, { type: 'pulled', changed: [], gone: ['n1', 'unknown'] });
  assert.deepEqual(s.notes.map((n) => n.uid), ['n2']);
  assert.deepEqual(reduceNoteLibrary(s, { type: 'forget', uid: 'n2' }).notes, []);
  assert.equal(reduceNoteLibrary(s, { type: 'forget', uid: 'ghost' }), s);
});

test('a list that shows nothing new leaves the copy as it is', () => {
  const s = reduceNoteLibrary(EMPTY_NOTE_LIBRARY, { type: 'saved', notes: [note('n1', '2026-10-01T10:00:00Z')] });
  assert.equal(reduceNoteLibrary(s, { type: 'saved', notes: [note('n1', '2026-10-01T10:00:00Z')] }), s);
  const changed = reduceNoteLibrary(s, { type: 'saved', notes: [note('n1', '2026-10-01T10:00:00Z', { updated_at: '2026-10-05T10:00:00Z', body: 'Edited' })] });
  assert.equal(changed.notes[0].body, 'Edited');
});

test('only notes about you or by you are kept', () => {
  assert.equal(isKept(note('n1', 't', { archer: 7, author: 9 }), 7), true);
  assert.equal(isKept(note('n1', 't', { archer: 8, author: 7 }), 7), true);
  assert.equal(isKept(note('n1', 't', { archer: 8, author: 9 }), 7), false);
});

test('the copy answers like the server: archer, photo, session and its event', () => {
  const s = reduceNoteLibrary(EMPTY_NOTE_LIBRARY, {
    type: 'pulled',
    gone: [],
    changed: [
      note('n1', '2026-10-01T10:00:00Z', { session: 's1' }),
      note('n2', '2026-10-02T10:00:00Z', { media: 'm1' }),
      note('n3', '2026-10-03T10:00:00Z', { event: 'e1' }),
      note('n4', '2026-10-04T10:00:00Z', { archer: 8, author: 7, session: 's1' }),
      note('n5', '2026-10-05T10:00:00Z', { visibility: 'private' }),
    ],
  });
  const uids = (query: Parameters<typeof selectNotes>[1]) => selectNotes(s, query).map((n) => n.uid);
  assert.deepEqual(uids({ archer: 7, session: 's1' }), ['n1']);
  assert.deepEqual(uids({ archer: 7, session: 's1', sessionEvent: 'e1' }), ['n3', 'n1']);
  assert.deepEqual(uids({ media: 'm1' }), ['n2']);
  assert.deepEqual(uids({ archer: 7, visibility: 'shared' }), ['n3', 'n2', 'n1']);
  assert.deepEqual(uids({ author: 7 }), ['n4']);
  assert.deepEqual(uids({ event: 'e1' }), ['n3']);
});

test('notes in the upload queue are left out, and nothing can be changed offline', () => {
  const s = reduceNoteLibrary(EMPTY_NOTE_LIBRARY, { type: 'pulled', gone: [], changed: [note('n1', '2026-10-01T10:00:00Z'), note('n2', '2026-10-02T10:00:00Z')] });
  const shown = selectNotes(s, { archer: 7 }, new Set(['n2']));
  assert.deepEqual(shown.map((n) => [n.uid, n.can_edit, n.can_delete]), [['n1', false, false]]);
  assert.equal(s.notes[0].can_edit, true);
});

test('the server is asked without the field that only the copy knows', () => {
  assert.deepEqual(serverQuery({ archer: 7, session: 's1', sessionEvent: 'e1' }), { archer: 7, session: 's1' });
});

type Call = { path: string; query: Record<string, unknown> };
const server = (answer: (call: Call) => unknown, calls: Call[] = []): ApiClient =>
  ({
    GET: async (path: string, init: { params: { query: Record<string, unknown> } }) => {
      const call = { path, query: init.params.query };
      calls.push(call);
      const data = answer(call);
      if (data instanceof Error) throw data;
      return { data };
    },
  }) as unknown as ApiClient;

test('a pull asks for notes about you, notes by you and the deleted ones, since the last time', async () => {
  const calls: Call[] = [];
  const api = server((call) => {
    if (call.path === '/api/gone/') return [{ kind: 'note', uid: 'n9', at: '2026-10-09T10:00:00Z' }];
    return call.query.archer ? [note('n1', '2026-10-01T10:00:00Z'), note('n2', '2026-10-02T10:00:00Z')] : [note('n2', '2026-10-02T10:00:00Z'), note('n3', '2026-10-03T10:00:00Z', { archer: 8, author: 7 })];
  }, calls);
  const result = await pullNotes(api, 7, '2026-09-30T10:00:00Z');
  assert.deepEqual(calls.map((c) => [c.path, c.query]), [
    ['/api/notes/', { archer: 7, updated_after: '2026-09-30T10:00:00Z' }],
    ['/api/notes/', { author: 7, updated_after: '2026-09-30T10:00:00Z' }],
    ['/api/gone/', { kind: 'note', updated_after: '2026-09-30T10:00:00Z' }],
  ]);
  assert.deepEqual(result?.changed.map((n) => n.uid), ['n1', 'n2', 'n3']);
  assert.deepEqual(result?.gone, ['n9']);
  assert.equal(result?.lastPull, '2026-10-09T10:00:00Z');
});

test('a first pull asks for everything, and a failed one keeps nothing', async () => {
  const calls: Call[] = [];
  await pullNotes(server(() => [], calls), 7);
  assert.deepEqual(calls.map((c) => Object.keys(c.query)), [['archer'], ['author'], ['kind']]);
  assert.equal(await pullNotes(server(() => new Error('offline')), 7), null);
  assert.equal(await pullNotes(server((call) => (call.path === '/api/gone/' ? undefined : [])), 7), null);
});
