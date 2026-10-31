// Signing in with data from local mode (#93): what the phone holds without an account is merged into the account's stores
// on the device, and the account's queues then upload it. Pure, with the storage passed in, so it is tested with `npm test`.
// The merge runs on the only copy of the person's data: everything is written, read back and checked before a local key is
// removed, and a failed write puts the account's keys back as they were.
import { EMPTY_EQUIPMENT, type EquipmentState, reduce as reduceEquipment } from './equipment-store.ts';
import { planImport } from './local-export.ts';
import { LOCAL_ARCHER } from './local-mode.ts';
import { EMPTY_LOG, type LogState, reduce as reduceLog, type Visibility } from './log-model.ts';
import type { QueuedMedia } from './media-queue.ts';
import { EMPTY_NOTES, type NotesState, reduce as reduceNotes } from './note-store.ts';
import { type StoreName, type StoreOwner, storeKey } from './store-owner.ts';

export type ClaimStorage = {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string) => Promise<void>;
  remove: (key: string) => Promise<void>;
};

export type LocalStores = { log: LogState; equipment: EquipmentState; notes: NotesState; media: QueuedMedia[] };
type Name = keyof LocalStores;
/** The stores that hold what a person logged: the log, equipment, notes and the media queue. (The library and kept-file caches are not data.) */
export const CLAIMED: Name[] = ['log', 'equipment', 'notes', 'media'];
const STORE_NAME: Record<Name, StoreName> = { log: 'log', equipment: 'equipment', notes: 'notes', media: 'media' };

export type LocalCounts = { sessions: number; bows: number; arrowSets: number; photos: number; videos: number; notes: number };

export function localCounts(stores: LocalStores): LocalCounts {
  return {
    sessions: stores.log.sessions.length,
    bows: stores.equipment.items.filter((i) => i.kind === 'bow').length,
    arrowSets: stores.equipment.items.filter((i) => i.kind === 'arrowSet').length,
    photos: stores.media.filter((m) => m.kind === 'photo').length,
    videos: stores.media.filter((m) => m.kind === 'video').length,
    notes: stores.notes.notes.length,
  };
}

export const countTotal = (c: LocalCounts) => c.sessions + c.bows + c.arrowSets + c.photos + c.videos + c.notes;

/** The stores as they are, what the confirmation and the upload start from. Nothing is changed. */
export function prepareUpload(stores: LocalStores, { userId, share }: { userId: number; share: boolean }): LocalStores {
  const visibility: Visibility = share ? 'coaches' : 'me';
  return {
    log: { ...stores.log, sessions: stores.log.sessions.map((s) => ({ ...s, visibility })) },
    equipment: stores.equipment,
    notes: { notes: stores.notes.notes.map((n) => (n.archer === LOCAL_ARCHER ? { ...n, archer: userId } : n)) },
    // A clip in a session follows the session; one in no session gets the answer itself.
    media: stores.media.map((m) => ({
      ...m,
      ...(m.owner === LOCAL_ARCHER ? { owner: userId } : {}),
      ...(m.session === null ? { visibility } : {}),
    })),
  };
}

/** The account's stores with the local ones added. The account's own queue stays first, so its ops go up before the local ones. */
export function mergeStores(account: LocalStores, local: LocalStores): LocalStores {
  const plan = planImport(
    { sessions: local.log.sessions, equipment: local.equipment.items, notes: local.notes.notes },
    { sessions: account.log.sessions, equipment: account.equipment.items, notes: account.notes.notes },
  );
  const known = new Set(account.media.map((m) => m.id));
  return {
    log: reduceLog(account.log, { type: 'imported', sessions: plan.add.sessions }),
    equipment: reduceEquipment(account.equipment, { type: 'imported', items: plan.add.equipment }),
    notes: reduceNotes(account.notes, { type: 'imported', notes: plan.add.notes }),
    media: [...account.media, ...local.media.filter((m) => !known.has(m.id))],
  };
}

const EMPTY: LocalStores = { log: EMPTY_LOG, equipment: EMPTY_EQUIPMENT, notes: EMPTY_NOTES, media: [] };

type Raw = Record<Name, string | null>;

async function readRaw(io: ClaimStorage, owner: StoreOwner): Promise<Raw> {
  const [log, equipment, notes, media] = await Promise.all(CLAIMED.map((n) => io.get(storeKey(STORE_NAME[n], owner))));
  return { log, equipment, notes, media };
}

/** Null when one of the stores cannot be parsed: it is not touched then, so the only copy stays as it is. */
function parseRaw(raw: Raw): LocalStores | null {
  try {
    const parse = <T>(text: string | null, empty: T): T => (text === null ? empty : (JSON.parse(text) as T));
    const stores: LocalStores = {
      log: { ...EMPTY_LOG, ...parse(raw.log, EMPTY.log) },
      equipment: { ...EMPTY_EQUIPMENT, ...parse(raw.equipment, EMPTY.equipment) },
      notes: { ...EMPTY_NOTES, ...parse(raw.notes, EMPTY.notes) },
      media: parse(raw.media, EMPTY.media),
    };
    return Array.isArray(stores.log.sessions) && Array.isArray(stores.equipment.items) && Array.isArray(stores.notes.notes) && Array.isArray(stores.media) ? stores : null;
  } catch {
    return null;
  }
}

/** What the local owner holds, read from the device. `unreadable`: a store is damaged, so nothing can be offered or moved. */
export async function readLocal(io: ClaimStorage, localId: string): Promise<{ stores: LocalStores } | { unreadable: true }> {
  const stores = parseRaw(await readRaw(io, { kind: 'local', id: localId }));
  return stores ? { stores } : { unreadable: true };
}

/** Everything the local stores held is in the account's stores. */
function holdsAll(saved: LocalStores, local: LocalStores): boolean {
  return (
    local.log.sessions.every((s) => saved.log.sessions.some((x) => x.id === s.id)) &&
    local.equipment.items.every((i) => saved.equipment.items.some((x) => x.kind === i.kind && x.uid === i.uid)) &&
    local.notes.notes.every((n) => saved.notes.notes.some((x) => x.uid === n.uid)) &&
    local.media.every((m) => saved.media.some((x) => x.id === m.id))
  );
}

export type ClaimResult = { ok: true; leftover: boolean } | { ok: false; reason: 'unreadable' | 'write' | 'verify' };

/**
 * Moves the local owner's data into the account's stores: read both, merge, write the account's keys, read them back and
 * compare, and only then remove the local keys. On any failure the local keys are untouched and the account's keys are put
 * back as they were. Repeating it is safe: items the account has are not added twice.
 */
export async function claimLocal(
  io: ClaimStorage,
  { localId, account, userId, share }: { localId: string; account: StoreOwner; userId: number; share: boolean },
): Promise<ClaimResult> {
  const localRaw = await readRaw(io, { kind: 'local', id: localId });
  const accountRaw = await readRaw(io, account);
  const local = parseRaw(localRaw);
  const before = parseRaw(accountRaw);
  if (!local || !before) return { ok: false, reason: 'unreadable' };

  const merged = mergeStores(before, prepareUpload(local, { userId, share }));
  const touched = CLAIMED.filter((n) => localRaw[n] !== null);
  const written = new Map<Name, string>(touched.map((n) => [n, JSON.stringify(merged[n])]));

  const undo = async () => {
    for (const n of touched) {
      const key = storeKey(STORE_NAME[n], account);
      await (accountRaw[n] === null ? io.remove(key) : io.set(key, accountRaw[n])).catch(() => {});
    }
  };

  try {
    for (const n of touched) await io.set(storeKey(STORE_NAME[n], account), written.get(n)!);
  } catch {
    await undo();
    return { ok: false, reason: 'write' };
  }
  try {
    const saved = await readRaw(io, account);
    if (!touched.every((n) => saved[n] === written.get(n))) throw new Error('read back differs');
    const parsed = parseRaw(saved);
    if (!parsed || !holdsAll(parsed, local)) throw new Error('data missing');
  } catch {
    await undo();
    return { ok: false, reason: 'verify' };
  }

  let leftover = false;
  for (const n of touched) await io.remove(storeKey(STORE_NAME[n], { kind: 'local', id: localId })).catch(() => (leftover = true));
  return { ok: true, leftover };
}
