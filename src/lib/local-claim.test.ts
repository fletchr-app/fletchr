import assert from 'node:assert/strict';
import { test } from 'vitest';

import { EMPTY_EQUIPMENT, reduce as reduceEquipment, type StoredItem } from './equipment-store.ts';
import { CLAIMED, claimLocal, type ClaimStorage, countTotal, localCounts, type LocalStores, mergeStores, prepareUpload, readLocal } from './local-claim.ts';
import { LOCAL_ARCHER } from './local-mode.ts';
import { EMPTY_LOG, type LogSession, reduce as reduceLog } from './log-model.ts';
import type { QueuedMedia } from './media-queue.ts';
import { EMPTY_NOTES, type QueuedNote, reduce as reduceNotes } from './note-store.ts';
import { type StoreOwner, storeKey } from './store-owner.ts';

const session = (id: string, extra: Partial<LogSession> = {}): LogSession => ({
  id, started_at: `2026-10-${id.padStart(2, '0')}T10:00:00Z`, ended_at: null, type: 'scoring', environment: '', location: '',
  ends: [{ id: `e${id}`, index: 0, distance_m: '18.0', face: 'wa-40', arrows_per_end: 3, shots: [] }],
  volume: [{ id: `v${id}`, distance_m: '18.0', arrow_count: 12 }],
  ...extra,
});
const item = (kind: 'bow' | 'arrowSet', uid: string): StoredItem => ({
  kind, uid, is_active: true, created_at: '2026-10-01T00:00:00Z', values: { name: uid }, revisions: [{ uid: `${uid}-r`, number: 1, created_at: '2026-10-01T00:00:00Z', values: { name: uid } }],
});
const note = (uid: string, extra: Partial<QueuedNote> = {}): QueuedNote => ({
  uid, archer: LOCAL_ARCHER, team: null, body: uid, visibility: 'private', session: null, end: null, media: null, frame: null, time_ms: null, drawing: null, created_at: '2026-10-20T11:00:00Z', ...extra,
});
const clip = (id: string, extra: Partial<QueuedMedia> = {}): QueuedMedia => ({ id, kind: 'photo', owner: null, session: null, taken_at: '2026-10-20T11:00:00Z', width: 4, height: 3, ...extra });

function stores(p: { sessions?: LogSession[]; items?: StoredItem[]; notes?: QueuedNote[]; media?: QueuedMedia[] }): LocalStores {
  return {
    log: reduceLog(EMPTY_LOG, { type: 'imported', sessions: p.sessions ?? [] }),
    equipment: reduceEquipment(EMPTY_EQUIPMENT, { type: 'imported', items: p.items ?? [] }),
    notes: reduceNotes(EMPTY_NOTES, { type: 'imported', notes: p.notes ?? [] }),
    media: p.media ?? [],
  };
}

const local = (): LocalStores =>
  stores({
    sessions: [session('20'), session('21')],
    items: [item('bow', 'b1'), item('arrowSet', 'a1')],
    notes: [note('n1', { session: '20' }), note('n2')],
    media: [clip('p1'), clip('v1', { kind: 'video', session: '20' })],
  });

const OWNER: StoreOwner = { kind: 'account', server: 'https://s', userId: '7' };
const ACCOUNT = { localId: 'L', account: OWNER, userId: 7 };
const key = (name: (typeof CLAIMED)[number], owner: StoreOwner) => storeKey(name, owner);
const LOCAL: StoreOwner = { kind: 'local', id: 'L' };

function memory(hooks: { failSet?: (key: string) => boolean; failRemove?: (key: string) => boolean; alterGet?: (key: string, value: string | null) => string | null } = {}) {
  const data = new Map<string, string>();
  const io: ClaimStorage = {
    get: async (k) => hooks.alterGet?.(k, data.get(k) ?? null) ?? data.get(k) ?? null,
    set: async (k, v) => {
      if (hooks.failSet?.(k)) throw new Error('disk full');
      data.set(k, v);
    },
    remove: async (k) => {
      if (hooks.failRemove?.(k)) throw new Error('cannot remove');
      data.delete(k);
    },
  };
  return { data, io };
}

function seedLocal(data: Map<string, string>, s: LocalStores = local()) {
  for (const n of CLAIMED) data.set(key(n, LOCAL), JSON.stringify(s[n]));
  data.set(storeKey('library', LOCAL), '{"cache":1}');
}

const read = <T>(data: Map<string, string>, name: (typeof CLAIMED)[number], owner: StoreOwner): T => JSON.parse(data.get(key(name, owner))!) as T;

test('counts per kind, and an empty owner counts nothing', () => {
  const c = localCounts({ ...local(), media: [clip('p1'), clip('p2'), clip('v1', { kind: 'video' })] });
  assert.deepEqual(c, { sessions: 2, bows: 1, arrowSets: 1, photos: 2, videos: 1, notes: 2 });
  assert.equal(countTotal(c), 9);
  assert.equal(countTotal(localCounts(stores({}))), 0);
});

test('prepareUpload sets the visibility of every session and of clips in no session, for both answers', () => {
  for (const [share, level] of [[true, 'coaches'], [false, 'me']] as const) {
    const out = prepareUpload(local(), { userId: 7, share });
    assert.ok(out.log.sessions.every((s) => s.visibility === level));
    assert.equal(out.media.find((m) => m.id === 'p1')!.visibility, level);
    assert.equal(out.media.find((m) => m.id === 'v1')!.visibility, undefined, 'a clip in a session follows the session');
  }
});

test('prepareUpload maps LOCAL_ARCHER to the account on notes and media and changes nothing else', () => {
  const input = stores({ notes: [note('n1'), note('n2', { archer: 3 })], media: [clip('p1', { owner: LOCAL_ARCHER }), clip('p2', { owner: null }), clip('p3', { owner: 5 })] });
  const out = prepareUpload(input, { userId: 7, share: false });
  assert.deepEqual(out.notes.notes.map((n) => n.archer), [7, 3]);
  assert.deepEqual(out.media.map((m) => m.owner), [7, null, 5]);
  assert.equal(input.notes.notes[0]!.archer, LOCAL_ARCHER, 'the input is not changed');
});

test('the merge keeps both sides, in every store', () => {
  const account = stores({ sessions: [session('5')], items: [item('bow', 'acc')], notes: [note('an', { archer: 7 })], media: [clip('am')] });
  const merged = mergeStores(account, local());
  assert.deepEqual(merged.log.sessions.map((s) => s.id).sort(), ['20', '21', '5']);
  assert.deepEqual(merged.equipment.items.map((i) => i.uid).sort(), ['a1', 'acc', 'b1']);
  assert.deepEqual(merged.notes.notes.map((n) => n.uid), ['an', 'n1', 'n2']);
  assert.deepEqual(merged.media.map((m) => m.id), ['am', 'p1', 'v1']);
});

test('the account\'s queue goes first, then the local ops', () => {
  const account = stores({ sessions: [session('5')], items: [item('bow', 'acc')] });
  const merged = mergeStores(account, local());
  const ops = merged.log.outbox.map((o) => o.sessionId);
  assert.deepEqual(ops.slice(0, 3), ['5', '5', '5']);
  assert.ok(ops.slice(3).every((id) => id === '20' || id === '21'));
  assert.equal(merged.equipment.outbox[0]!.uid, 'acc');
  assert.ok(new Set(merged.log.outbox.map((o) => o.rev)).size === merged.log.outbox.length, 'revisions stay distinct');
});

test('what the account has is not added twice and stays as it is', () => {
  const account = stores({ sessions: [session('20', { location: 'account copy' })], items: [item('bow', 'b1')], notes: [note('n1', { body: 'account note' })], media: [clip('p1', { note: 'account' })] });
  const merged = mergeStores(account, local());
  assert.equal(merged.log.sessions.filter((s) => s.id === '20').length, 1);
  assert.equal(merged.log.sessions.find((s) => s.id === '20')!.location, 'account copy');
  assert.equal(merged.equipment.items.filter((i) => i.uid === 'b1').length, 1);
  assert.equal(merged.notes.notes.find((n) => n.uid === 'n1')!.body, 'account note');
  assert.equal(merged.media.find((m) => m.id === 'p1')!.note, 'account');
});

test('an upload moves the data: the account\'s keys hold it, the local keys are gone', async () => {
  const { data, io } = memory();
  seedLocal(data);
  data.set(key('log', OWNER), JSON.stringify(stores({ sessions: [session('5')] }).log));
  const result = await claimLocal(io, { ...ACCOUNT, share: true });
  assert.deepEqual(result, { ok: true, leftover: false });
  for (const n of CLAIMED) assert.equal(data.has(key(n, LOCAL)), false, `${n} removed`);
  assert.ok(data.has(storeKey('library', LOCAL)), 'caches are not part of the move');
  const log = read<{ sessions: LogSession[] }>(data, 'log', OWNER);
  assert.deepEqual(log.sessions.map((s) => s.id).sort(), ['20', '21', '5']);
  assert.ok(log.sessions.filter((s) => s.id !== '5').every((s) => s.visibility === 'coaches'));
  assert.deepEqual(read<{ notes: QueuedNote[] }>(data, 'notes', OWNER).notes.map((n) => n.archer), [7, 7]);
  assert.ok(read<QueuedMedia[]>(data, 'media', OWNER).every((m) => m.owner === null || m.owner === 7));
  assert.equal(read<QueuedMedia[]>(data, 'media', OWNER).find((m) => m.id === 'p1')!.visibility, 'coaches');
  assert.equal(read<{ items: StoredItem[] }>(data, 'equipment', OWNER).items.length, 2);
});

test('No keeps sessions and clips in no session private', async () => {
  const { data, io } = memory();
  seedLocal(data);
  await claimLocal(io, { ...ACCOUNT, share: false });
  assert.ok(read<{ sessions: LogSession[] }>(data, 'log', OWNER).sessions.every((s) => s.visibility === 'me'));
  assert.equal(read<QueuedMedia[]>(data, 'media', OWNER).find((m) => m.id === 'p1')!.visibility, 'me');
});

test('a failed write leaves the local keys in place and the account\'s keys as they were', async () => {
  const before = JSON.stringify(stores({ sessions: [session('5')] }).log);
  const { data, io } = memory({ failSet: (k) => k === key('notes', OWNER) });
  seedLocal(data);
  data.set(key('log', OWNER), before);
  const snapshot = new Map(data);
  const result = await claimLocal(io, { ...ACCOUNT, share: true });
  assert.deepEqual(result, { ok: false, reason: 'write' });
  for (const n of CLAIMED) assert.equal(data.get(key(n, LOCAL)), snapshot.get(key(n, LOCAL)), `${n} untouched`);
  assert.equal(data.get(key('log', OWNER)), before, 'the account log is back as it was');
  assert.equal(data.has(key('equipment', OWNER)), false, 'a key that did not exist is removed again');
});

test('a read back that differs from what was written is a failure, and nothing is removed', async () => {
  const { data, io } = memory({ alterGet: (k, v) => (k === key('media', OWNER) && v ? v.replace('"p1"', '"px"') : null) });
  seedLocal(data);
  const result = await claimLocal(io, { ...ACCOUNT, share: true });
  assert.deepEqual(result, { ok: false, reason: 'verify' });
  for (const n of CLAIMED) assert.ok(data.has(key(n, LOCAL)), `${n} kept`);
  assert.equal(data.has(key('log', OWNER)), false, 'rolled back');
});

test('a read back that lost an item is a failure', async () => {
  // The device reports the account log without one of the sessions, as if the write had been cut short.
  const { data, io } = memory({
    alterGet: (k, v) => {
      if (k !== key('log', OWNER) || !v) return null;
      const log = JSON.parse(v) as { sessions: LogSession[] };
      return JSON.stringify({ ...log, sessions: log.sessions.slice(1) });
    },
  });
  seedLocal(data);
  assert.deepEqual(await claimLocal(io, { ...ACCOUNT, share: true }), { ok: false, reason: 'verify' });
  assert.ok(data.has(key('log', LOCAL)));
});

test('an unreadable local store is not touched and nothing is written', async () => {
  const { data, io } = memory();
  seedLocal(data);
  data.set(key('notes', LOCAL), '{broken');
  assert.deepEqual(await readLocal(io, 'L'), { unreadable: true });
  assert.deepEqual(await claimLocal(io, { ...ACCOUNT, share: true }), { ok: false, reason: 'unreadable' });
  assert.equal(data.get(key('notes', LOCAL)), '{broken');
  assert.equal(data.has(key('log', OWNER)), false);
});

test('an unreadable account store is not overwritten either', async () => {
  const { data, io } = memory();
  seedLocal(data);
  data.set(key('log', OWNER), 'nonsense');
  assert.deepEqual(await claimLocal(io, { ...ACCOUNT, share: true }), { ok: false, reason: 'unreadable' });
  assert.equal(data.get(key('log', OWNER)), 'nonsense');
  assert.ok(data.has(key('log', LOCAL)));
});

test('when a local key cannot be removed the data is safe on both sides, and repeating the upload adds nothing twice', async () => {
  const { data, io } = memory({ failRemove: (k) => k === key('log', LOCAL) });
  seedLocal(data);
  assert.deepEqual(await claimLocal(io, { ...ACCOUNT, share: true }), { ok: true, leftover: true });
  assert.ok(data.has(key('log', LOCAL)));
  const once = data.get(key('log', OWNER));
  await claimLocal(io, { ...ACCOUNT, share: true });
  const log = JSON.parse(data.get(key('log', OWNER))!) as { sessions: LogSession[]; outbox: unknown[] };
  assert.deepEqual(log.sessions.map((s) => s.id).sort(), ['20', '21']);
  assert.equal(data.get(key('log', OWNER)), once);
});

test('stores the local owner does not have are not written', async () => {
  const { data, io } = memory();
  data.set(key('log', LOCAL), JSON.stringify(stores({ sessions: [session('20')] }).log));
  assert.deepEqual(await claimLocal(io, { ...ACCOUNT, share: true }), { ok: true, leftover: false });
  assert.equal(data.has(key('notes', OWNER)), false);
  assert.ok(data.has(key('log', OWNER)));
});
