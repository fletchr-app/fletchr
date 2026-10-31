import assert from 'node:assert/strict';
import { test } from 'vitest';

import type { QueuedMedia } from './media-queue.ts';
import { clipOfQueued, playerSiblings } from './queued-clip.ts';

const item = (id: string, extra: Partial<QueuedMedia> = {}): QueuedMedia => ({
  id, kind: 'video', owner: null, session: null, taken_at: '2026-10-30T10:00:00Z', width: 1080, height: 1920, duration_ms: 4000, capture_fps: 120, frame_count: 480, ...extra,
});

test('a queued clip looks like the server will describe it, for yourself or for an archer', () => {
  const urls = { file: 'blob:f', thumbnail: 'blob:t' };
  const own = clipOfQueued(item('a', { session: 's1' }), 7, urls);
  assert.deepEqual([own.id, own.owner, own.uploaded_by, own.session, own.kind, own.file_url, own.thumbnail_url, own.can_edit], ['a', 7, 7, 's1', 'video', 'blob:f', 'blob:t', true]);
  assert.deepEqual([own.duration_ms, own.capture_fps, own.frame_count], [4000, 120, 480]);
  assert.equal(clipOfQueued(item('b', { owner: 9 }), 7, urls).owner, 9);
  const photo = clipOfQueued(item('c', { kind: 'photo', duration_ms: undefined, capture_fps: undefined, frame_count: undefined }), 7, urls);
  assert.deepEqual([photo.duration_ms, photo.capture_fps, photo.event, photo.note], [null, null, '', '']);
});

test('what waits comes first in the player, then what the server listed, without doubles', () => {
  const queued = [item('q1', { session: 's1' }), item('q2', { session: 's2' }), item('q3', { session: 's1', kind: 'photo' })];
  const listed = [{ id: 'q1', kind: 'video' }, { id: 'r1', kind: 'video' }];
  assert.deepEqual(playerSiblings(queued, listed, { session: 's1' }, 7).map((m) => m.id), ['q1', 'q3', 'r1']);
});

test('without a session the clips of that archer are meant, no archer is yourself', () => {
  const queued = [item('q1'), item('q2', { owner: 9 }), item('q3', { session: 's1' })];
  assert.deepEqual(playerSiblings(queued, [], { owner: 7 }, 7).map((m) => m.id), ['q1', 'q3']);
  assert.deepEqual(playerSiblings(queued, [], { owner: 9 }, 7).map((m) => m.id), ['q2']);
});
