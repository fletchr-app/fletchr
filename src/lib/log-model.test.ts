import assert from 'node:assert/strict';
import { test } from 'vitest';

import {
  EMPTY_LOG,
  defaultChoice,
  endTotal,
  chosenKeys,
  gearFor,
  gearLine,
  keypadFor,
  nextEndDefaults,
  reduce,
  sessionTotals,
  sessionTypeKey,
  usesEnds,
  sortedShots,
  shotLabel,
  type Equipment,
  type LogAction,
  type LogEnd,
  type LogSession,
  type LogState,
} from './log-model.ts';

const session = (id = 's1'): LogSession => ({
  id, started_at: '2026-10-18T09:00:00Z', ended_at: null, type: 'scoring', environment: 'indoor', location: '', ends: [], volume: [],
});
const shot = (id: string, value: number | null, extra = {}) => ({ id, value, is_x: false, is_miss: false, ...extra });
const end = (id: string, index: number, shots = [shot('a', 10), shot('b', 9)]): LogEnd => ({
  id, index, distance_m: '18', face: 'wa-40', arrows_per_end: 3, shots,
});
const run = (...actions: LogAction[]): LogState => actions.reduce(reduce, EMPTY_LOG);
const keys = (s: LogState) => s.outbox.map((o) => `${o.kind}${o.delete ? '-delete' : ''}`);

test('starting a session queues its upload', () => {
  const s = run({ type: 'startSession', session: session() });
  assert.equal(s.sessions.length, 1);
  assert.deepEqual(keys(s), ['session']);
});

test('saving an end queues it after the session, and saving again does not queue a second upload', () => {
  const s = run(
    { type: 'startSession', session: session() },
    { type: 'saveEnd', sessionId: 's1', end: end('e1', 0) },
    { type: 'saveEnd', sessionId: 's1', end: end('e1', 0, [shot('a', 10)]) },
  );
  assert.deepEqual(keys(s), ['session', 'end']);
  assert.equal(s.sessions[0].ends.length, 1);
  assert.equal(s.sessions[0].ends[0].shots.length, 1);
});

test('ends are kept in index order', () => {
  const s = run(
    { type: 'startSession', session: session() },
    { type: 'saveEnd', sessionId: 's1', end: end('e2', 1) },
    { type: 'saveEnd', sessionId: 's1', end: end('e1', 0) },
  );
  assert.deepEqual(s.sessions[0].ends.map((e) => e.id), ['e1', 'e2']);
});

test('editing the session while it waits keeps its place in front of the ends', () => {
  const s = run(
    { type: 'startSession', session: session() },
    { type: 'saveEnd', sessionId: 's1', end: end('e1', 0) },
    { type: 'updateSession', id: 's1', patch: { ended_at: '2026-10-18T11:00:00Z' } },
  );
  assert.deepEqual(keys(s), ['session', 'end']);
  assert.equal(s.sessions[0].ended_at, '2026-10-18T11:00:00Z');
});

test('a finished upload leaves the queue, but an edit made during it stays', () => {
  let s = run({ type: 'startSession', session: session() }, { type: 'saveEnd', sessionId: 's1', end: end('e1', 0) });
  const sending = s.outbox[1]; // the upload of e1 starts...
  s = reduce(s, { type: 'saveEnd', sessionId: 's1', end: end('e1', 0, [shot('a', 10), shot('b', 9), shot('c', 8)]) }); // ...and e1 is edited
  s = reduce(s, { type: 'opDone', key: sending.key, rev: sending.rev });
  assert.deepEqual(keys(s), ['session', 'end'], 'the newer edit is still queued');
  const latest = s.outbox[1];
  s = reduce(s, { type: 'opDone', key: latest.key, rev: latest.rev });
  assert.deepEqual(keys(s), ['session']);
});

test('deleting an end replaces its upload with a delete', () => {
  const s = run(
    { type: 'startSession', session: session() },
    { type: 'saveEnd', sessionId: 's1', end: end('e1', 0) },
    { type: 'deleteEnd', sessionId: 's1', endId: 'e1' },
  );
  assert.deepEqual(keys(s), ['session', 'end-delete']);
  assert.equal(s.sessions[0].ends.length, 0);
});

test('deleting a session drops its pending uploads and queues one delete', () => {
  const s = run(
    { type: 'startSession', session: session('s1') },
    { type: 'startSession', session: session('s2') },
    { type: 'saveEnd', sessionId: 's1', end: end('e1', 0) },
    { type: 'saveVolume', sessionId: 's1', entry: { id: 'v1', distance_m: '18', arrow_count: 30 } },
    { type: 'deleteSession', id: 's1' },
  );
  assert.deepEqual(s.outbox.map((o) => `${o.sessionId}:${o.kind}${o.delete ? '-delete' : ''}`), ['s2:session', 's1:session-delete']);
  assert.deepEqual(s.sessions.map((x) => x.id), ['s2']);
});

test('failed uploads are skipped until retried, and can be discarded', () => {
  let s = run({ type: 'startSession', session: session() });
  s = reduce(s, { type: 'opFailed', key: s.outbox[0].key, rev: s.outbox[0].rev, error: 'Not allowed' });
  assert.equal(s.outbox[0].error, 'Not allowed');
  const retried = reduce(s, { type: 'retryFailed' });
  assert.equal(retried.outbox[0].error, undefined);
  assert.equal(reduce(s, { type: 'discardFailed' }).outbox.length, 0);
  assert.equal(reduce(s, { type: 'discardFailed' }).sessions.length, 1, 'the local data stays');
});

test('a late failure for an old version does not mark the newer edit as failed', () => {
  let s = run({ type: 'startSession', session: session() }, { type: 'saveEnd', sessionId: 's1', end: end('e1', 0) });
  const old = s.outbox[1];
  s = reduce(s, { type: 'saveEnd', sessionId: 's1', end: end('e1', 0, []) });
  s = reduce(s, { type: 'opFailed', key: old.key, rev: old.rev, error: 'boom' });
  assert.equal(s.outbox[1].error, undefined);
});

test('totals: X counts 10, a miss counts 0', () => {
  const e = end('e1', 0, [shot('a', 10, { is_x: true }), shot('b', 9), shot('c', null, { is_miss: true })]);
  assert.equal(endTotal(e), 19);
  assert.deepEqual(e.shots.map(shotLabel), ['X', '9', 'M']);
  const s = { ...session(), ends: [e, end('e2', 1)], volume: [{ id: 'v', distance_m: '18', arrow_count: 30 }] };
  assert.deepEqual(sessionTotals(s), { arrows: 3 + 2 + 30, score: 19 + 19 });
});

test('keypad: X only where the face has an X ring, rings best first, then a miss', () => {
  const wa122 = { kind: 'wa', x_diameter_cm: 6.1, rings: [10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((value) => ({ value })) };
  assert.deepEqual(keypadFor(wa122).map((k) => k.label), ['X', '10', '9', '8', '7', '6', '5', '4', '3', '2', '1', 'M']);
  const triple = { kind: 'wa', rings: [10, 9, 8, 7, 6].map((value) => ({ value })) };
  assert.deepEqual(keypadFor(triple).map((k) => k.label), ['10', '9', '8', '7', '6', 'M']);
  assert.deepEqual(keypadFor({ kind: 'blank', rings: [] }), []);
  const x = keypadFor(wa122)[0];
  assert.deepEqual([x.value, x.is_x], [10, true]);
});

test('next end starts like the last one', () => {
  assert.deepEqual(nextEndDefaults(session()), { index: 0, distance_m: '18', face: 'wa-40', arrows_per_end: 3 });
  assert.equal(nextEndDefaults({ ...session(), environment: 'outdoor' }).face, 'wa-122');
  const withEnd = { ...session(), ends: [{ ...end('e1', 4), distance_m: '30', face: 'wa-80', arrows_per_end: 6 }] };
  assert.deepEqual(nextEndDefaults(withEnd), { index: 5, distance_m: '30', face: 'wa-80', arrows_per_end: 6 });
});

test('arrows sort best first: X before 10, misses last', () => {
  const shots = [shot('m', null, { is_miss: true }), shot('a', 9), shot('x', 10, { is_x: true }), shot('t', 10), shot('b', 7)];
  assert.deepEqual(sortedShots(shots).map(shotLabel), ['X', '10', '9', '7', 'M']);
  assert.deepEqual(shots.map((s) => s.id), ['m', 'a', 'x', 't', 'b'], 'the original order is untouched');
});

const equipment: Equipment = {
  bows: [{ key: '1', id: 1, name: 'Hoyt', type: 'recurve', revision: 11, revision_number: 2 }, { key: '2', id: 2, name: 'Mathews', type: 'compound', revision: 12, revision_number: 1 }],
  arrowSets: [{ key: '5', id: 5, name: 'X10', revision: 21, revision_number: 3, count: 12 }],
};

test('gear takes the current revisions and labels from the stored equipment', () => {
  assert.deepEqual(gearFor(equipment, '1', '5'), {
    bow_id: 1, bow_revision: 11, bow_label: 'Hoyt (r2)', bow_key: '1', bow_revision_uid: null,
    arrow_set_id: 5, arrow_set_revision: 21, arrow_label: 'X10 (r3)', arrow_set_key: '5', arrow_set_revision_uid: null,
  });
  assert.equal(gearLine(gearFor(equipment, '1', '5')), 'Hoyt (r2) · X10 (r3)');
  assert.equal(gearLine(gearFor(equipment, '2', null)), 'Mathews (r1)');
  assert.equal(gearLine(gearFor(equipment, null, null)), '');
  assert.equal(gearLine(undefined), '');
});

test('arrows without a bow are dropped, as a setup needs a bow', () => {
  const gear = gearFor(equipment, null, '5');
  assert.deepEqual([gear.bow_revision, gear.arrow_set_revision, gear.arrow_label], [null, null, '']);
});

test('an item that is not in the stored equipment is treated as not chosen', () => {
  assert.equal(gearFor(equipment, '99', null).bow_revision, null);
  assert.equal(gearFor(equipment, '1', '99').arrow_set_revision, null);
});

test('the preselection is the last pair used, else the only item, else nothing', () => {
  assert.deepEqual(defaultChoice(equipment, []), { bowKey: null, arrowSetKey: '5' }, 'two bows: no guess; one arrow set: that one');
  const used = (bowKey: string, arrowSetKey: string | null): LogSession => ({ ...session(), gear: gearFor(equipment, bowKey, arrowSetKey) });
  assert.deepEqual(defaultChoice(equipment, [used('2', null), used('1', '5')]), { bowKey: '2', arrowSetKey: '5' }, 'newest session first');
  assert.deepEqual(defaultChoice(equipment, [{ ...session(), gear: null }, used('1', '5')]), { bowKey: '1', arrowSetKey: '5' }, 'sessions without a bow are skipped');
  const gone: LogSession = { ...session(), gear: { ...gearFor(equipment, '1', '5'), bow_key: null, arrow_set_key: null, bow_id: 77, arrow_set_id: 88 } };
  assert.deepEqual(defaultChoice(equipment, [gone]), { bowKey: null, arrowSetKey: '5' }, 'equipment that is no longer active is not suggested');
  assert.deepEqual(defaultChoice({ bows: [equipment.bows[0]], arrowSets: [] }, []), { bowKey: '1', arrowSetKey: null });
});

test('gear saved before there were keys is matched to the items by integer id', () => {
  const uidEquipment: Equipment = {
    bows: [{ key: 'uid-b', id: 1, name: 'Hoyt', type: 'recurve', revision: 11, revision_uid: 'rev-b', revision_number: 2 }],
    arrowSets: [{ key: 'uid-a', id: 5, name: 'X10', revision: 21, revision_uid: 'rev-a', revision_number: 3, count: 12 }],
  };
  const old = { bow_id: 1, bow_revision: 11, bow_label: '', arrow_set_id: 5, arrow_set_revision: 21, arrow_label: '' };
  assert.deepEqual(chosenKeys(uidEquipment, old), { bowKey: 'uid-b', arrowSetKey: 'uid-a' });
  assert.deepEqual(chosenKeys(uidEquipment, undefined), { bowKey: null, arrowSetKey: null });
  const gear = gearFor(uidEquipment, 'uid-b', 'uid-a');
  assert.deepEqual([gear.bow_key, gear.bow_revision_uid, gear.arrow_set_revision_uid], ['uid-b', 'rev-b', 'rev-a']);
});

test('equipment made on the phone has no integer id: the gear names it by key and revision uid', () => {
  const local: Equipment = { bows: [{ key: 'uid-b', id: null, name: 'New', type: 'recurve', revision: null, revision_uid: 'rev-b', revision_number: 1 }], arrowSets: [] };
  const gear = gearFor(local, 'uid-b', null);
  assert.deepEqual([gear.bow_id, gear.bow_revision, gear.bow_key, gear.bow_revision_uid], [null, null, 'uid-b', 'rev-b']);
  assert.deepEqual(chosenKeys(local, gear), { bowKey: 'uid-b', arrowSetKey: null });
});

test('changing the equipment of a session queues the session again', () => {
  const s = run({ type: 'startSession', session: session() }, { type: 'updateSession', id: 's1', patch: { gear: gearFor(equipment, '1', '5') } });
  assert.equal(s.sessions[0].gear?.bow_label, 'Hoyt (r2)');
  assert.deepEqual(keys(s), ['session']);
});

test('the stored equipment is kept and old saved logs without it still load', () => {
  assert.deepEqual(reduce(EMPTY_LOG, { type: 'setEquipment', equipment }).equipment, equipment);
  const old = { sessions: [], outbox: [], nextRev: 5 } as unknown as LogState;
  assert.deepEqual(reduce(EMPTY_LOG, { type: 'load', state: old }).equipment, { bows: [], arrowSets: [] });
});

test('reset forgets everything on the device', () => {
  const s = run(
    { type: 'setEquipment', equipment },
    { type: 'startSession', session: session() },
    { type: 'saveEnd', sessionId: 's1', end: end('e1', 0) },
    { type: 'reset' },
  );
  assert.deepEqual(s, EMPTY_LOG);
});

// --- sessions a coach opened, merged ids ---------------------------------------------------------

test('an empty type has its own label and no ends', () => {
  assert.equal(sessionTypeKey(''), 'sessionType.unset');
  assert.equal(sessionTypeKey('volume'), 'sessionType.volume');
  assert.equal(usesEnds(''), false);
});

test('the type can be set while there are no results, not after', () => {
  const open: LogSession = { ...session(), type: '' };
  const set = run({ type: 'load', state: { ...EMPTY_LOG, sessions: [open] } }, { type: 'updateSession', id: 's1', patch: { type: 'volume' } });
  assert.equal(set.sessions[0].type, 'volume');
  const shot1 = run({ type: 'startSession', session: session() }, { type: 'saveEnd', sessionId: 's1', end: end('e1', 0) }, { type: 'updateSession', id: 's1', patch: { type: 'volume' } });
  assert.equal(shot1.sessions[0].type, 'scoring');
});

test('pulled sessions are stored without an upload, and never over a local one or one deleted here', () => {
  const coach: LogSession = { ...session('c1'), type: '', keep: true, opened_by: 9 };
  let s = run({ type: 'startSession', session: session('mine') }, { type: 'deleteSession', id: 'gone' });
  s = reduce(s, { type: 'pulled', sessions: [coach, session('mine'), session('gone')], lastPull: 't1' });
  assert.deepEqual(s.sessions.map((x) => x.id).sort(), ['c1', 'mine']);
  assert.equal(s.lastPull, 't1');
  assert.deepEqual(s.outbox.map((o) => o.key), ['session:mine:', 'session:gone:']);
  assert.equal(reduce(s, { type: 'pulled', sessions: [coach] }).sessions.length, 2, 'no duplicate');
});

test('replacing an id renames the session and rewrites the queue, keeping the session ahead of its ends', () => {
  const s = run(
    { type: 'startSession', session: session('old') },
    { type: 'saveEnd', sessionId: 'old', end: end('e1', 0) },
    { type: 'replaceSessionId', from: 'old', to: 'new' },
  );
  assert.deepEqual(s.sessions.map((x) => x.id), ['new']);
  assert.deepEqual(s.outbox.map((o) => [o.key, o.sessionId]), [['session:new:', 'new'], ['end:new:e1', 'new']]);
});

test('a delete of the merged-away id is not sent to the winner', () => {
  const s = run({ type: 'startSession', session: session('old') }, { type: 'deleteSession', id: 'old' }, { type: 'replaceSessionId', from: 'old', to: 'new' });
  assert.deepEqual(s.outbox, []);
});

test('when the new id is local too, ends and volume move over, renumbered after the existing ends, and go up again', () => {
  const s = run(
    { type: 'startSession', session: { ...session('old'), type: 'scoring', location: 'Hall' } },
    { type: 'saveEnd', sessionId: 'old', end: end('o1', 0) },
    { type: 'saveEnd', sessionId: 'old', end: end('o2', 1) },
    { type: 'saveVolume', sessionId: 'old', entry: { id: 'v1', distance_m: '18', arrow_count: 6 } },
    { type: 'startSession', session: { ...session('new'), location: '' } },
    { type: 'saveEnd', sessionId: 'new', end: end('n1', 0) },
    { type: 'saveEnd', sessionId: 'new', end: end('n2', 4) },
    { type: 'replaceSessionId', from: 'old', to: 'new' },
  );
  assert.deepEqual(s.sessions.map((x) => x.id), ['new']);
  const merged = s.sessions[0];
  assert.deepEqual(merged.ends.map((e) => [e.id, e.index]), [['n1', 0], ['n2', 4], ['o1', 5], ['o2', 6]]);
  assert.deepEqual(merged.volume.map((v) => v.id), ['v1']);
  assert.equal(merged.location, 'Hall', 'an empty field is filled');
  const keysOut = s.outbox.map((o) => o.key);
  assert.equal(new Set(keysOut).size, keysOut.length, 'one op per item');
  assert.ok(['end:new:o1', 'end:new:o2', 'volume:new:v1', 'session:new:'].every((k) => keysOut.includes(k)));
  assert.ok(s.outbox.every((o) => o.sessionId === 'new'));
});

test('a coach\'s copy of a session that went into the archer\'s is dropped', () => {
  const copy: LogSession = { ...session('old'), type: '', owner: 5, owner_name: 'Ann', keep: true, noResults: true };
  const s = run({ type: 'startSession', session: copy }, { type: 'replaceSessionId', from: 'old', to: 'new' });
  assert.deepEqual(s.sessions, []);
  assert.deepEqual(s.outbox, []);
});

test('a session the server deleted goes, with what was queued for it', () => {
  const s = run({ type: 'startSession', session: session() }, { type: 'sessionGone', id: 's1' });
  assert.deepEqual([s.sessions, s.outbox], [[], []]);
});

test('a session the server deleted is kept when results of it were not uploaded', () => {
  const s = run({ type: 'startSession', session: session() }, { type: 'saveEnd', sessionId: 's1', end: end('e1', 0) }, { type: 'sessionGone', id: 's1' });
  assert.deepEqual(s.sessions.map((x) => [x.id, x.gone, x.ends.length]), [['s1', true, 1]]);
  assert.deepEqual(s.outbox, []);
});

test('keeping a deleted session as a new one queues the session and all its results', () => {
  const s = run(
    { type: 'startSession', session: session() },
    { type: 'saveEnd', sessionId: 's1', end: end('e1', 0) },
    { type: 'saveVolume', sessionId: 's1', entry: { id: 'v1', distance_m: '18', arrow_count: 6 } },
    { type: 'sessionGone', id: 's1' },
    { type: 'keepGoneAsNew', id: 's1', newId: 's2' },
  );
  assert.deepEqual(s.sessions.map((x) => [x.id, x.gone]), [['s2', undefined]]);
  assert.deepEqual(s.outbox.map((o) => o.key), ['session:s2:', 'end:s2:e1', 'volume:s2:v1']);
});

test('discarding a deleted session drops it, and only a deleted one', () => {
  const kept = run({ type: 'startSession', session: session() }, { type: 'discardGone', id: 's1' });
  assert.equal(kept.sessions.length, 1);
  const s = run({ type: 'startSession', session: session() }, { type: 'saveEnd', sessionId: 's1', end: end('e1', 0) }, { type: 'sessionGone', id: 's1' }, { type: 'discardGone', id: 's1' });
  assert.deepEqual([s.sessions, s.outbox], [[], []]);
});
