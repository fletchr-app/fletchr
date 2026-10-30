import assert from 'node:assert/strict';
import { test } from 'vitest';

import { EMPTY_NOTES, type NoteAction, type NotesState, pendingNotes, type QueuedNote, reduce } from './note-store.ts';

const note = (uid: string, extra: Partial<QueuedNote> = {}): QueuedNote => ({
  uid, archer: 7, team: 1, body: 'Watch the bow arm', visibility: 'coach_only', session: null, end: null, media: null, frame: null, time_ms: null,
  drawing: null, created_at: '2026-10-30T10:00:00Z', ...extra,
});
const run = (...actions: NoteAction[]): NotesState => actions.reduce(reduce, EMPTY_NOTES);

test('a note is queued once, in the order it was written', () => {
  const s = run({ type: 'add', note: note('a') }, { type: 'add', note: note('b') }, { type: 'add', note: note('a', { body: 'again' }) });
  assert.deepEqual(s.notes.map((n) => [n.uid, n.body]), [['a', 'Watch the bow arm'], ['b', 'Watch the bow arm']]);
});

test('a note leaves the queue when it is sent or taken back', () => {
  const s = run({ type: 'add', note: note('a') }, { type: 'add', note: note('b') }, { type: 'remove', uid: 'a' });
  assert.deepEqual(s.notes.map((n) => n.uid), ['b']);
});

test('a refused note can be tried again or given up, and the others stay', () => {
  const failed = run({ type: 'add', note: note('a') }, { type: 'add', note: note('b') }, { type: 'failed', uid: 'a', error: 'no' });
  assert.equal(failed.notes[0].error, 'no');
  assert.equal(reduce(failed, { type: 'retryFailed' }).notes[0].error, undefined);
  assert.deepEqual(reduce(failed, { type: 'discardFailed' }).notes.map((n) => n.uid), ['b']);
});

test('the notes of an archer are found, narrowed to a session or a photo', () => {
  const s = run(
    { type: 'add', note: note('a', { session: 's1' }) },
    { type: 'add', note: note('b', { media: 'm1' }) },
    { type: 'add', note: note('c', { archer: 8 }) },
  );
  assert.deepEqual(pendingNotes(s, { archer: 7 }).map((n) => n.uid), ['a', 'b']);
  assert.deepEqual(pendingNotes(s, { archer: 7, session: 's1' }).map((n) => n.uid), ['a']);
  assert.deepEqual(pendingNotes(s, { archer: 7, media: 'm1' }).map((n) => n.uid), ['b']);
});

test('old saved data without notes loads, and reset forgets them', () => {
  assert.deepEqual(reduce(EMPTY_NOTES, { type: 'load', state: {} as NotesState }), EMPTY_NOTES);
  assert.deepEqual(run({ type: 'add', note: note('a') }, { type: 'reset' }), EMPTY_NOTES);
});
