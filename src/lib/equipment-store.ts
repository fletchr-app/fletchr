// Your bows and arrow sets on this device, plus the queue of uploads still to do. Pure functions only (no Vue, no storage),
// so they can be tested with `npm test`. An item is made on the phone with an id of its own (`uid`), so it can be created,
// changed and used in a session without a connection; it goes up later with a repeatable `PUT` by that uid.
import { ARROW_SET_FIELDS, BOW_FIELDS, type FieldSpec } from './equipment-fields.ts';
import type { CachedArrowSet, CachedBow, Equipment } from './log-model.ts';

export type EquipmentKind = 'bow' | 'arrowSet';

/** The tracked values of an item as the API has them: text, whole numbers, decimals as text, or null. */
export type Values = Record<string, string | number | null>;

/** A state of an item. A new one is written whenever a tracked value really changes, as on the server. */
export type StoredRevision = { uid: string; id?: number; number: number; created_at: string; values: Values };

export type StoredItem = {
  kind: EquipmentKind;
  uid: string;
  /** The server's integer id; missing until the server has seen the item. */
  id?: number;
  is_active: boolean;
  created_at: string;
  values: Values;
  /** Newest first. From the server only the current one is known until its history is opened. */
  revisions: StoredRevision[];
};

export type EquipmentOp = {
  key: string;
  kind: EquipmentKind;
  uid: string;
  delete?: boolean;
  /** For a delete: the item is already gone from the list, so its id is kept here. */
  id?: number;
  rev: number;
  error?: string;
};

export type EquipmentState = { items: StoredItem[]; outbox: EquipmentOp[]; nextRev: number };
export const EMPTY_EQUIPMENT: EquipmentState = { items: [], outbox: [], nextRev: 1 };

/** What the server says about an item in its list. */
export type ServerItem = {
  kind: EquipmentKind;
  uid: string;
  id: number;
  is_active: boolean;
  created_at: string;
  values: Values;
  revision: { uid: string; id: number; number: number };
};

export type EquipmentAction =
  | { type: 'load'; state: EquipmentState }
  | { type: 'reset' }
  /** The items the server has now. Items with something waiting to upload keep the phone's version. */
  | { type: 'pulled'; items: ServerItem[] }
  /** Create (new `uid`) or change an item. `revisionUid` is used if the values are new. */
  | { type: 'save'; kind: EquipmentKind; uid: string; values: Values; is_active: boolean; now: string; revisionUid: string }
  | { type: 'remove'; kind: EquipmentKind; uid: string }
  | { type: 'opDone'; key: string; rev: number; result?: { id: number; revision_uid: string; revision_number: number } }
  | { type: 'opFailed'; key: string; rev: number; error: string }
  | { type: 'retryFailed' }
  | { type: 'discardFailed' };

export const fieldsOf = (kind: EquipmentKind): FieldSpec[] => (kind === 'bow' ? BOW_FIELDS : ARROW_SET_FIELDS);
const opKey = (kind: EquipmentKind, uid: string) => `${kind}:${uid}`;

/** Decimals compare as numbers, because the form says "38" where the server says "38.0". */
function sameValue(spec: FieldSpec, a: Values[string] | undefined, b: Values[string] | undefined): boolean {
  const x = a ?? null;
  const y = b ?? null;
  if (x === null || y === null) return x === y;
  if (spec.kind === 'decimal' || spec.kind === 'integer') return Number(x) === Number(y);
  return String(x) === String(y);
}

export const sameValues = (kind: EquipmentKind, a: Values, b: Values) => fieldsOf(kind).every((f) => sameValue(f, a[f.key], b[f.key]));

function queue(state: EquipmentState, kind: EquipmentKind, uid: string, extra: Partial<EquipmentOp> = {}): EquipmentState {
  const key = opKey(kind, uid);
  const op: EquipmentOp = { key, kind, uid, rev: state.nextRev, ...extra };
  const at = state.outbox.findIndex((o) => o.key === key);
  const outbox = at === -1 ? [...state.outbox, op] : state.outbox.map((o, i) => (i === at ? op : o));
  return { ...state, outbox, nextRev: state.nextRev + 1 };
}

const mapItem = (state: EquipmentState, kind: EquipmentKind, uid: string, fn: (item: StoredItem) => StoredItem): EquipmentState => ({
  ...state,
  items: state.items.map((i) => (i.kind === kind && i.uid === uid ? fn(i) : i)),
});

export function reduce(state: EquipmentState, action: EquipmentAction): EquipmentState {
  switch (action.type) {
    case 'load':
      return { ...EMPTY_EQUIPMENT, ...action.state };
    case 'reset':
      return EMPTY_EQUIPMENT;
    case 'save': {
      const { kind, uid, values, is_active, now, revisionUid } = action;
      const existing = state.items.find((i) => i.kind === kind && i.uid === uid);
      if (!existing) {
        const first: StoredRevision = { uid: revisionUid, number: 1, created_at: now, values };
        const item: StoredItem = { kind, uid, is_active, created_at: now, values, revisions: [first] };
        return queue({ ...state, items: [...state.items, item] }, kind, uid);
      }
      const current = existing.revisions[0];
      const changed = !current || !sameValues(kind, current.values, values);
      const revisions = changed ? [{ uid: revisionUid, number: (current?.number ?? 0) + 1, created_at: now, values }, ...existing.revisions] : existing.revisions;
      return queue(mapItem(state, kind, uid, (i) => ({ ...i, values, is_active, revisions })), kind, uid);
    }
    case 'remove': {
      const item = state.items.find((i) => i.kind === action.kind && i.uid === action.uid);
      if (!item) return state;
      const gone = { ...state, items: state.items.filter((i) => i !== item) };
      const key = opKey(action.kind, action.uid);
      // Never uploaded: there is nothing on the server to delete.
      if (item.id === undefined) return { ...gone, outbox: gone.outbox.filter((o) => o.key !== key) };
      return queue(gone, action.kind, action.uid, { delete: true, id: item.id });
    }
    case 'opDone': {
      const done = { ...state, outbox: state.outbox.filter((o) => !(o.key === action.key && o.rev === action.rev)) };
      const op = state.outbox.find((o) => o.key === action.key && o.rev === action.rev);
      if (!op || op.delete || !action.result) return done;
      const { id, revision_uid, revision_number } = action.result;
      // The server numbers the revisions; the number it gives is the one that counts.
      return mapItem(done, op.kind, op.uid, (item) => ({
        ...item,
        id,
        revisions: item.revisions.map((r) => (r.uid === revision_uid ? { ...r, number: revision_number } : r)),
      }));
    }
    case 'opFailed':
      return { ...state, outbox: state.outbox.map((o) => (o.key === action.key && o.rev === action.rev ? { ...o, error: action.error } : o)) };
    case 'retryFailed':
      return { ...state, outbox: state.outbox.map(({ error: _error, ...o }) => o) };
    case 'discardFailed':
      return { ...state, outbox: state.outbox.filter((o) => !o.error) };
    case 'pulled': {
      const pending = new Set(state.outbox.map((o) => o.key));
      const serverKeys = new Set(action.items.map((s) => opKey(s.kind, s.uid)));
      // What the server no longer has and the phone has nothing waiting for was deleted elsewhere.
      const kept = state.items.filter((i) => {
        const key = opKey(i.kind, i.uid);
        return pending.has(key) || serverKeys.has(key) || i.id === undefined;
      });
      const items = [...kept];
      for (const s of action.items) {
        const key = opKey(s.kind, s.uid);
        if (pending.has(key)) continue;
        const at = items.findIndex((i) => i.kind === s.kind && i.uid === s.uid);
        const current: StoredRevision = { uid: s.revision.uid, id: s.revision.id, number: s.revision.number, created_at: '', values: s.values };
        if (at === -1) {
          items.push({ kind: s.kind, uid: s.uid, id: s.id, is_active: s.is_active, created_at: s.created_at, values: s.values, revisions: [current] });
          continue;
        }
        const known = items[at].revisions;
        const have = known.find((r) => r.uid === current.uid);
        const revisions = have
          ? known.map((r) => (r === have ? { ...r, id: current.id, number: current.number, values: s.values } : r))
          : [current, ...known];
        items[at] = { ...items[at], id: s.id, is_active: s.is_active, values: s.values, revisions };
      }
      return { ...state, items };
    }
  }
}

// --- selectors ----------------------------------------------------------------------------------

const byName = (a: StoredItem, b: StoredItem) => String(a.values.name ?? '').localeCompare(String(b.values.name ?? ''));

export const itemsOf = (state: EquipmentState, kind: EquipmentKind): StoredItem[] => state.items.filter((i) => i.kind === kind).sort(byName);

export const findItem = (state: EquipmentState, kind: EquipmentKind, uid: string): StoredItem | undefined =>
  state.items.find((i) => i.kind === kind && i.uid === uid);

/** The active items in the shape the session screens use to choose equipment. */
export function sessionEquipment(state: EquipmentState): Equipment {
  const active = (kind: EquipmentKind) => itemsOf(state, kind).filter((i) => i.is_active && i.revisions.length > 0);
  return {
    bows: active('bow').map(
      (i): CachedBow => ({
        key: i.uid,
        id: i.id ?? null,
        name: String(i.values.name ?? ''),
        type: String(i.values.type ?? ''),
        revision: i.revisions[0].id ?? null,
        revision_uid: i.revisions[0].uid,
        revision_number: i.revisions[0].number,
      }),
    ),
    arrowSets: active('arrowSet').map(
      (i): CachedArrowSet => ({
        key: i.uid,
        id: i.id ?? null,
        name: String(i.values.name ?? ''),
        revision: i.revisions[0].id ?? null,
        revision_uid: i.revisions[0].uid,
        revision_number: i.revisions[0].number,
        count: i.values.count == null ? null : Number(i.values.count),
      }),
    ),
  };
}

/** A revision the server has not seen yet: something for its item is waiting to upload. */
export function revisionPending(state: EquipmentState, revisionUid: string): boolean {
  return state.items.some((i) => i.revisions.some((r) => r.uid === revisionUid) && state.outbox.some((o) => o.key === opKey(i.kind, i.uid) && !o.delete));
}
