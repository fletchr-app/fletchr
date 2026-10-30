import assert from 'node:assert/strict';
import { test } from 'vitest';

import {
  EMPTY_EQUIPMENT,
  type EquipmentAction,
  type EquipmentState,
  findItem,
  itemsOf,
  reduce,
  revisionPending,
  type ServerItem,
  sessionEquipment,
  type Values,
} from './equipment-store.ts';

const run = (...actions: EquipmentAction[]): EquipmentState => actions.reduce(reduce, EMPTY_EQUIPMENT);

const bow = (extra: Values = {}): Values => ({ name: 'Hoyt', type: 'recurve', draw_weight: '38.0', riser: '', ...extra });
const save = (uid: string, values: Values, revisionUid: string, active = true): EquipmentAction => ({
  type: 'save', kind: 'bow', uid, values, is_active: active, now: '2026-10-29T10:00:00Z', revisionUid,
});
const server = (uid: string, id: number, values: Values, revision: ServerItem['revision'], extra: Partial<ServerItem> = {}): ServerItem => ({
  kind: 'bow', uid, id, is_active: true, created_at: '2026-10-01T00:00:00Z', values, revision, ...extra,
});

test('a new item gets revision 1 with the uid the app gave it, and is queued', () => {
  const s = run(save('b1', bow(), 'r1'));
  const item = findItem(s, 'bow', 'b1')!;
  assert.deepEqual(item.revisions.map((r) => [r.uid, r.number]), [['r1', 1]]);
  assert.equal(item.id, undefined);
  assert.deepEqual(s.outbox.map((o) => o.key), ['bow:b1']);
});

test('a changed value adds a revision, newest first', () => {
  const s = run(save('b1', bow(), 'r1'), save('b1', bow({ draw_weight: '40.0' }), 'r2'));
  assert.deepEqual(findItem(s, 'bow', 'b1')!.revisions.map((r) => [r.uid, r.number]), [['r2', 2], ['r1', 1]]);
  assert.equal(s.outbox.length, 1, 'one op per item');
});

test('saving the same values adds no revision, also when a decimal is written differently', () => {
  const s = run(save('b1', bow(), 'r1'), save('b1', bow({ draw_weight: '38' }), 'r2'), save('b1', bow(), 'r3', false));
  const item = findItem(s, 'bow', 'b1')!;
  assert.deepEqual(item.revisions.map((r) => r.uid), ['r1']);
  assert.equal(item.is_active, false, 'the active flag is not a tracked value');
});

test('an empty value and a missing one are the same', () => {
  const s = run(save('b1', bow({ draw_weight: null }), 'r1'), save('b1', bow({ draw_weight: null, tiller: null }), 'r2'));
  assert.equal(findItem(s, 'bow', 'b1')!.revisions.length, 1);
});

test('the server numbers the revisions: its number and id are taken over when the upload is done', () => {
  const queued = run(save('b1', bow(), 'r1'));
  const op = queued.outbox[0];
  const s = reduce(queued, { type: 'opDone', key: op.key, rev: op.rev, result: { id: 7, revision_uid: 'r1', revision_number: 3 } });
  const item = findItem(s, 'bow', 'b1')!;
  assert.deepEqual([item.id, item.revisions[0].number, s.outbox.length], [7, 3, 0]);
});

test('an edit made during the upload stays queued', () => {
  const queued = run(save('b1', bow(), 'r1'));
  const sent = queued.outbox[0];
  const edited = reduce(queued, save('b1', bow({ draw_weight: '40.0' }), 'r2'));
  const s = reduce(edited, { type: 'opDone', key: sent.key, rev: sent.rev, result: { id: 7, revision_uid: 'r1', revision_number: 1 } });
  assert.equal(s.outbox.length, 1);
});

test('removing an item the server never saw leaves nothing to send', () => {
  const s = run(save('b1', bow(), 'r1'), { type: 'remove', kind: 'bow', uid: 'b1' });
  assert.deepEqual([s.items, s.outbox], [[], []]);
});

test('removing an item the server has queues a delete with its id', () => {
  const pulled = run({ type: 'pulled', items: [server('b1', 7, bow(), { uid: 'r1', id: 70, number: 1 })] }, { type: 'remove', kind: 'bow', uid: 'b1' });
  assert.deepEqual(pulled.items, []);
  assert.deepEqual(pulled.outbox.map((o) => [o.key, o.delete, o.id]), [['bow:b1', true, 7]]);
});

const deleting = () => {
  const queued = run({ type: 'pulled', items: [server('b1', 7, bow(), { uid: 'r1', id: 70, number: 1 })] }, { type: 'remove', kind: 'bow', uid: 'b1' });
  return { queued, op: queued.outbox[0] };
};

test('a delete the server refuses puts the item back and keeps the reason', () => {
  const { queued, op } = deleting();
  assert.deepEqual(queued.items, []);
  const s = reduce(queued, { type: 'opFailed', key: op.key, rev: op.rev, error: 'used in a session' });
  assert.deepEqual(s.items.map((i) => [i.uid, i.id, i.values.name]), [['b1', 7, 'Hoyt']]);
  assert.deepEqual(s.outbox.map((o) => [o.key, o.error]), [['bow:b1', 'used in a session']]);
});

test('giving up on a refused delete keeps the item', () => {
  const { queued, op } = deleting();
  const failed = reduce(queued, { type: 'opFailed', key: op.key, rev: op.rev, error: 'no' });
  const s = reduce(failed, { type: 'discardFailed' });
  assert.deepEqual([s.items.length, s.outbox.length], [1, 0]);
});

test('trying a refused delete again takes the item off the list again', () => {
  const { queued, op } = deleting();
  const failed = reduce(queued, { type: 'opFailed', key: op.key, rev: op.rev, error: 'no' });
  const s = reduce(failed, { type: 'retryFailed' });
  assert.deepEqual([s.items.length, s.outbox.map((o) => [o.delete, o.error])], [0, [[true, undefined]]]);
});

test('changing an item whose delete was refused replaces the delete', () => {
  const { queued, op } = deleting();
  const failed = reduce(queued, { type: 'opFailed', key: op.key, rev: op.rev, error: 'no' });
  const s = reduce(failed, save('b1', bow({ draw_weight: '40.0' }), 'r2', false));
  assert.deepEqual(s.outbox.map((o) => [o.key, o.delete, o.error]), [['bow:b1', undefined, undefined]]);
  assert.equal(findItem(s, 'bow', 'b1')!.is_active, false);
});

test('a pull while a refused delete is shown does not change the item', () => {
  const { queued, op } = deleting();
  const failed = reduce(queued, { type: 'opFailed', key: op.key, rev: op.rev, error: 'no' });
  const s = reduce(failed, { type: 'pulled', items: [server('b1', 7, bow({ name: 'Other' }), { uid: 'r1', id: 70, number: 1 })] });
  assert.equal(findItem(s, 'bow', 'b1')!.values.name, 'Hoyt');
});

test('a pull adds items, and updates one that has nothing waiting', () => {
  const first = run({ type: 'pulled', items: [server('b1', 7, bow(), { uid: 'r1', id: 70, number: 1 })] });
  assert.deepEqual(first.items.map((i) => [i.uid, i.id, i.revisions[0].id]), [['b1', 7, 70]]);
  const second = reduce(first, { type: 'pulled', items: [server('b1', 7, bow({ draw_weight: '42.0' }), { uid: 'r2', id: 71, number: 2 })] });
  const item = findItem(second, 'bow', 'b1')!;
  assert.deepEqual([item.values.draw_weight, item.revisions.map((r) => r.number)], ['42.0', [2, 1]]);
});

test('a pull does not overwrite an item that has a change waiting', () => {
  const s = run(
    { type: 'pulled', items: [server('b1', 7, bow(), { uid: 'r1', id: 70, number: 1 })] },
    save('b1', bow({ draw_weight: '44.0' }), 'r2'),
    { type: 'pulled', items: [server('b1', 7, bow(), { uid: 'r1', id: 70, number: 1 })] },
  );
  assert.equal(findItem(s, 'bow', 'b1')!.values.draw_weight, '44.0');
  assert.equal(s.outbox.length, 1);
});

test('a pull drops an item the server no longer has, but keeps one that was never uploaded', () => {
  const s = run(
    { type: 'pulled', items: [server('b1', 7, bow(), { uid: 'r1', id: 70, number: 1 })] },
    save('b2', bow({ name: 'New' }), 'r9'),
    { type: 'opDone', key: 'bow:b2', rev: 2 },
    { type: 'pulled', items: [] },
  );
  assert.deepEqual(s.items.map((i) => i.uid), ['b2'], 'b2 has no id and nothing waiting: kept; b1 is gone');
});

test('a failed upload can be tried again or given up', () => {
  const queued = run(save('b1', bow(), 'r1'));
  const op = queued.outbox[0];
  const failed = reduce(queued, { type: 'opFailed', key: op.key, rev: op.rev, error: 'no' });
  assert.equal(failed.outbox[0].error, 'no');
  assert.equal(reduce(failed, { type: 'retryFailed' }).outbox[0].error, undefined);
  assert.equal(reduce(failed, { type: 'discardFailed' }).outbox.length, 0);
});

test('the session screens get the active items with their current revisions, by name', () => {
  const s = run(save('b2', bow({ name: 'Zed' }), 'r2'), save('b1', bow({ name: 'Alpha' }), 'r1'), save('b3', bow({ name: 'Off' }), 'r3', false), {
    type: 'save', kind: 'arrowSet', uid: 'a1', values: { name: 'X10', count: 12 }, is_active: true, now: 'n', revisionUid: 'ra1',
  });
  const eq = sessionEquipment(s);
  assert.deepEqual(eq.bows.map((b) => [b.key, b.name, b.revision_uid, b.id]), [['b1', 'Alpha', 'r1', null], ['b2', 'Zed', 'r2', null]]);
  assert.deepEqual(eq.arrowSets.map((a) => [a.key, a.count]), [['a1', 12]]);
});

test('a revision is pending while something for its item waits to upload', () => {
  const queued = run(save('b1', bow(), 'r1'));
  assert.equal(revisionPending(queued, 'r1'), true);
  assert.equal(revisionPending(queued, 'other'), false);
  const op = queued.outbox[0];
  assert.equal(revisionPending(reduce(queued, { type: 'opDone', key: op.key, rev: op.rev }), 'r1'), false);
});

test('items are listed by name per kind', () => {
  const s = run(save('b1', bow({ name: 'B' }), 'r1'), save('b2', bow({ name: 'A' }), 'r2'));
  assert.deepEqual(itemsOf(s, 'bow').map((i) => i.uid), ['b2', 'b1']);
  assert.deepEqual(itemsOf(s, 'arrowSet'), []);
});
