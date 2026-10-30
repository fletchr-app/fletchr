import assert from 'node:assert/strict';
import { test } from 'vitest';

import type { StoredItem } from './equipment-store.ts';
import { buildExport, EXPORT_VERSION, type LocalData, parseExport, planImport } from './local-export.ts';
import type { LogSession } from './log-model.ts';
import type { QueuedNote } from './note-store.ts';
import { EMPTY_LOG, reduce } from './log-model.ts';
import { EMPTY_EQUIPMENT, reduce as reduceEquipment } from './equipment-store.ts';

const session = (id: string, extra: Partial<LogSession> = {}): LogSession => ({
  id, started_at: `2026-10-${id.padStart(2, '0')}T10:00:00Z`, ended_at: null, type: 'scoring', environment: '', location: '',
  ends: [{ id: `e${id}`, index: 0, distance_m: '18.0', face: 'wa-40', arrows_per_end: 3, shots: [{ id: `s${id}`, value: 9, is_x: false, is_miss: false, x: 0.1, y: 0 }] }],
  volume: [{ id: `v${id}`, distance_m: '18.0', arrow_count: 12 }],
  ...extra,
});
const bow: StoredItem = {
  kind: 'bow', uid: 'bow-1', is_active: true, created_at: '2026-10-01T00:00:00Z', values: { name: 'Hoyt' },
  revisions: [{ uid: 'rev-1', number: 1, created_at: '2026-10-01T00:00:00Z', values: { name: 'Hoyt' } }],
};
const note: QueuedNote = {
  uid: 'n1', archer: 0, team: null, body: 'Anchor higher', visibility: 'private', session: '20', end: null, media: 'm1', frame: null, time_ms: null,
  drawing: { v: 1, shapes: [{ t: 'line', p: [[0.1, 0.1], [0.5, 0.5]] }] }, created_at: '2026-10-20T11:00:00Z',
};
const data: LocalData = { sessions: [session('20')], equipment: [bow], notes: [note] };

test('an export read back gives the same data', () => {
  const file = JSON.stringify(buildExport(data, 3, '0.15.0', new Date('2026-10-30T10:00:00Z')));
  const parsed = parseExport(file);
  assert.ok(parsed.ok);
  assert.deepEqual(parsed.data.sessions, data.sessions);
  assert.deepEqual(parsed.data.notes, data.notes);
  assert.equal(parsed.data.equipment[0]!.uid, 'bow-1');
  assert.deepEqual(parsed.data.equipment[0]!.revisions.map((r) => [r.uid, r.number]), [['rev-1', 1]]);
  assert.equal(parsed.data.mediaNotIncluded, 3);
});

test('what is not the person\'s own is left out of the export, and the notes lose their upload errors', () => {
  const built = buildExport({ ...data, sessions: [session('20'), session('21', { owner: 7 }), session('22', { gone: true })], notes: [{ ...note, error: '403' }] }, 0, '0.15.0', new Date());
  assert.deepEqual(built.sessions.map((s) => s.id), ['20']);
  assert.equal('error' in built.notes[0]!, false);
});

test('files that are not ours or not readable are refused with a reason', () => {
  assert.deepEqual(parseExport('{'), { ok: false, reason: 'notJson' });
  assert.deepEqual(parseExport('[]'), { ok: false, reason: 'notOurs' });
  assert.deepEqual(parseExport(JSON.stringify({ format: 'something-else' })), { ok: false, reason: 'notOurs' });
  assert.deepEqual(parseExport(JSON.stringify({ format: 'fletchr-local', version: EXPORT_VERSION + 1, sessions: [], equipment: [], notes: [] })), { ok: false, reason: 'newer' });
  assert.deepEqual(parseExport(JSON.stringify({ format: 'fletchr-local', version: 1, sessions: [{ id: 'x' }], equipment: [], notes: [] })), { ok: false, reason: 'broken' });
  assert.deepEqual(parseExport(JSON.stringify({ format: 'fletchr-local', version: 1, sessions: [] })), { ok: false, reason: 'broken' });
});

test('account ids in a file are dropped on import', () => {
  const file = JSON.stringify({ ...buildExport(data, 0, '0.15.0', new Date()), notes: [{ ...note, archer: 9, team: 4 }], sessions: [{ ...session('20'), owner: 7, owner_name: 'x', opened_by: 3 }] });
  const parsed = parseExport(file);
  assert.ok(parsed.ok);
  assert.equal(parsed.data.notes[0]!.archer, 0);
  assert.equal(parsed.data.notes[0]!.team, null);
  assert.equal(parsed.data.sessions[0]!.owner, undefined);
});

test('an import adds what the device does not have and keeps what it has', () => {
  const device: LocalData = { sessions: [session('20', { location: 'on this phone' })], equipment: [], notes: [] };
  const plan = planImport({ sessions: [session('20', { location: 'in the file' }), session('21')], equipment: [bow], notes: [note] }, device);
  assert.deepEqual(plan.added, { sessions: 1, equipment: 1, notes: 1 });
  assert.deepEqual(plan.kept, { sessions: 1, equipment: 0, notes: 0 });
  const log = reduce({ ...EMPTY_LOG, sessions: device.sessions }, { type: 'imported', sessions: [session('20', { location: 'in the file' }), ...plan.add.sessions] });
  assert.deepEqual(log.sessions.map((s) => [s.id, s.location]), [['21', ''], ['20', 'on this phone']]);
  // everything added is queued, as for new items: the upload of a later account starts from this queue
  assert.deepEqual(log.outbox.map((o) => o.key), ['session:21:', 'end:21:e21', 'volume:21:v21']);
  const equipment = reduceEquipment(EMPTY_EQUIPMENT, { type: 'imported', items: plan.add.equipment });
  assert.equal(equipment.items.length, 1);
  assert.equal(reduceEquipment(equipment, { type: 'imported', items: [bow] }).items.length, 1, 'importing twice adds nothing');
});
