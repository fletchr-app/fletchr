import type { Proof } from '@/composables/useProof';
import { App } from '@capacitor/app';
import { Network } from '@capacitor/network';
import { computed, effectScope, ref, shallowRef, watch } from 'vue';

import { useAuth } from '@/composables/useAuth';
import { useEquipment } from '@/composables/useEquipment';
import { useKeyedStore } from '@/composables/useKeyedStore';
import { t } from '@/i18n';
import type { components } from '@/lib/api-types';
import { errorMessage } from '@/lib/errors';
import { dataStore } from '@/lib/local-store';
import type { EventLink } from '@/lib/schedule';
import {
  EMPTY_LOG,
  type Environment,
  type Equipment,
  type Gear,
  type LogAction,
  type LogSession,
  type LogEnd,
  type LogState,
  type Op,
  type SessionDetails,
  type LogVolume,
  reduce,
  type SessionType,
} from '@/lib/log-model';
import { drain, pull, send, waitsForEquipment } from '@/lib/log-sync';
import { storeKey } from '@/lib/store-owner';
import { newId } from '@/lib/uuid';

const RETRY_INTERVAL_MS = 20_000;

export type DeletedCounts = components['schemas']['DeletedCounts'];

const { api, userId, storeOwner, status, signOut } = useAuth();

// Each user on each server has their own local log.
const storageKey = computed(() => (storeOwner.value ? storeKey('log', storeOwner.value) : null));

const state = shallowRef<LogState>(EMPTY_LOG);
// This is the current truth, so the upload loop sees its own updates immediately.
let current: LogState = EMPTY_LOG;
let flushing = false;
// Uploads stop while the server erases your data, so a queued upload cannot bring it back.
let paused = false;
let inflight: Promise<void> | null = null;

// Sessions the server merged into others: old id to new id. Screens that hold an old id follow it, and so does the media queue.
const renamed = ref<Readonly<Record<string, string>>>({});
const renameListeners: ((from: string, to: string) => void)[] = [];
// Things that belong to the account and must go with it (the queued photos and videos).
const accountDeletedListeners: (() => void)[] = [];

// Counts finished uploads: a pull that was fetched while one finished may lack that item, so it is dropped (see `pullNow`).
let uploads = 0;

function dispatch(action: LogAction) {
  if (action.type === 'opDone') uploads += 1;
  current = reduce(current, action);
  state.value = current;
  const rename = action.type === 'replaceSessionId' ? { from: action.from, to: action.to } : action.type === 'keepGoneAsNew' ? { from: action.id, to: action.newId } : null;
  if (rename && rename.from !== rename.to) {
    renamed.value = { ...renamed.value, [rename.from]: rename.to };
    renameListeners.forEach((listener) => listener(rename.from, rename.to));
  }
}

let pulling = false;

/**
 * Your sessions as the server has them (new ones, changes from another phone, what a coach opened), and which ones the
 * server merged or deleted. Before the uploads, so they go to the right id. What was fetched is dropped when an upload
 * finished meanwhile (the server's list may predate it and would look like a deleted end); the next sync fetches again.
 */
async function pullNow() {
  if (pulling || paused || !loaded.value || status.value !== 'signedIn' || userId.value === null) return;
  pulling = true;
  const before = uploads;
  try {
    const deleting = new Set(current.outbox.filter((o) => o.kind === 'session' && o.delete).map((o) => o.sessionId));
    const actions = await pull(api, Number(userId.value), current.lastPull, deleting);
    if (actions && !paused && uploads === before) actions.forEach(dispatch);
  } finally {
    pulling = false;
  }
}

async function sync() {
  await pullNow();
  await flush();
}

// The log of the signed-in account is loaded from the device and saved again after each change. It keeps showing nothing
// until it is loaded (`loaded`), and the app of another account never sees it.
const { loaded } = effectScope(true).run(() =>
  useKeyedStore<LogState>({
    key: storageKey,
    empty: EMPTY_LOG,
    read: () => state.value,
    apply: (value) => dispatch({ type: 'load', state: value }),
    changes: state,
  }),
)!;
const waiting = computed(() => state.value.outbox.filter((o) => !o.error).length);
const failed = computed(() => state.value.outbox.filter((o) => o.error));
// Sessions the server deleted while results of them were waiting: the archer chooses what happens to them.
const conflicts = computed(() => state.value.sessions.filter((s) => s.gone));
const sessions = computed(() => (loaded.value ? state.value.sessions : []));
const eq = useEquipment();
// The equipment on the device. A copy that an older version of the app kept in the log is used until the first one is made or read.
const equipment = computed<Equipment>(() => {
  const old = state.value.equipment;
  if (!eq.empty.value || (old.bows.length === 0 && old.arrowSets.length === 0)) return eq.equipment.value;
  return {
    bows: old.bows.map((b) => ({ ...b, key: b.key ?? String(b.id) })),
    arrowSets: old.arrowSets.map((a) => ({ ...a, key: a.key ?? String(a.id) })),
  };
});
// Sessions deleted on this device. The server's list of sessions can still show them until the delete has been sent and
// the list is fetched again; ones whose delete is still queued stay hidden after a restart too.
const deletedHere = ref<ReadonlySet<string>>(new Set());
const goneSessions = computed(
  () => new Set([...deletedHere.value, ...state.value.outbox.filter((o) => o.kind === 'session' && o.delete).map((o) => o.sessionId)]),
);

async function flush() {
  if (flushing || paused || !loaded.value || status.value !== 'signedIn') return;
  flushing = true;
  // A session that names equipment the server has not seen yet waits for it (the whole queue does, to keep its order).
  const sendOp = async (s: LogState, op: Op) => (waitsForEquipment(s, op, eq.revisionPending) ? ({ kind: 'retry' } as const) : send(api, s, op));
  const run = drain(() => current, dispatch, sendOp, () => paused);
  inflight = run;
  try {
    await run;
  } finally {
    flushing = false;
    inflight = null;
  }
}

// Uploads wait while the server erases something, and for any upload already on its way.
async function withUploadsPaused<T>(action: () => Promise<T>): Promise<T> {
  paused = true;
  try {
    await inflight?.catch(() => {});
    return await action();
  } finally {
    paused = false;
  }
}

async function deleteMyData(proof: Proof, confirm: string): Promise<{ deleted: DeletedCounts } | { error: string }> {
  return withUploadsPaused(async () => {
    try {
      const { data, error } = await api.POST('/api/me/delete-data/', { body: { ...proof, confirm } });
      if (!data) return { error: errorMessage(error) };
      dispatch({ type: 'reset' });
      return { deleted: data.deleted };
    } catch {
      return { error: t('common.nothingDeleted') };
    }
  });
}

/** Deletes the account too; on success you are signed out, so the screen is gone when this returns. */
async function deleteMyAccount(proof: Proof, confirm: string): Promise<{ error: string; teams: string[] }> {
  return withUploadsPaused(async () => {
    try {
      const { data, error } = await api.POST('/api/me/delete-account/', { body: { ...proof, confirm } });
      if (!data) {
        const blocking = (error as { teams?: { name: string }[] } | undefined)?.teams ?? [];
        return { error: errorMessage(error), teams: blocking.map((t) => t.name) };
      }
      dispatch({ type: 'reset' });
      if (storageKey.value) await dataStore.remove(storageKey.value).catch(() => {});
      accountDeletedListeners.forEach((listener) => listener()); // before signing out, while the queue is still this account's
      await signOut(); // the account is gone: back to the sign-in screen
      return { error: '', teams: [] };
    } catch {
      return { error: t('common.nothingDeleted'), teams: [] };
    }
  });
}

function startSession(
  type: SessionType, environment: Environment, location: string, gear?: Gear, archer?: { id: number; name: string }, extra?: Partial<LogSession>,
): string {
  const id = newId();
  dispatch({
    type: 'startSession',
    session: {
      id, started_at: new Date().toISOString(), ended_at: null, type, environment, location, ends: [], volume: [],
      ...(gear ? { gear } : {}),
      ...(archer ? { owner: archer.id, owner_name: archer.name } : {}),
      ...extra,
    },
  });
  return id;
}

/** The session is still waiting to be created on the server, so nothing can be attached to it yet. */
function sessionWaiting(id: string): boolean {
  return state.value.outbox.some((o) => o.sessionId === id && o.kind === 'session' && !o.error);
}

/** A note about this session or end must wait: the server does not have it yet. */
function parentWaiting(sessionId: string | null, endId: string | null): boolean {
  return state.value.outbox.some(
    (o) => !o.delete && ((sessionId !== null && o.kind === 'session' && o.sessionId === sessionId) || (endId !== null && o.kind === 'end' && o.itemId === endId)),
  );
}

const actions = {
  startSession,
  sessionWaiting,
  parentWaiting,
  setType: (id: string, type: SessionType) => dispatch({ type: 'updateSession', id, patch: { type } }),
  onSessionRenamed: (listener: (from: string, to: string) => void) => void renameListeners.push(listener),
  onAccountDeleted: (listener: () => void) => void accountDeletedListeners.push(listener),
  setDetails: (id: string, details: SessionDetails) => dispatch({ type: 'updateSession', id, patch: { details } }),
  setEvent: (id: string, event: EventLink | null) => dispatch({ type: 'updateSession', id, patch: { event } }),
  setGear: (id: string, gear: Gear) => dispatch({ type: 'updateSession', id, patch: { gear } }),
  finishSession: (id: string, finished: boolean) =>
    dispatch({ type: 'updateSession', id, patch: { ended_at: finished ? new Date().toISOString() : null } }),
  deleteSession: (id: string) => {
    deletedHere.value = new Set([...deletedHere.value, id]);
    dispatch({ type: 'deleteSession', id });
  },
  saveEnd: (sessionId: string, end: LogEnd) => dispatch({ type: 'saveEnd', sessionId, end }),
  deleteEnd: (sessionId: string, endId: string) => dispatch({ type: 'deleteEnd', sessionId, endId }),
  saveVolume: (sessionId: string, entry: LogVolume) => dispatch({ type: 'saveVolume', sessionId, entry }),
  deleteVolume: (sessionId: string, entryId: string) => dispatch({ type: 'deleteVolume', sessionId, entryId }),
  retryFailed: () => {
    dispatch({ type: 'retryFailed' });
    void flush();
  },
  discardFailed: () => dispatch({ type: 'discardFailed' }),
  keepGoneAsNew: (id: string) => {
    dispatch({ type: 'keepGoneAsNew', id, newId: newId() });
    void flush();
  },
  discardGone: (id: string) => dispatch({ type: 'discardGone', id }),
  deleteMyData,
  deleteMyAccount,
};

// The log lives as long as the app: its watchers are never stopped.
effectScope(true).run(() => {
  // Upload whenever something new is queued, again every so often while something is waiting, and on return to the app.
  watch([() => state.value.outbox, loaded, status], () => void flush(), { immediate: true });
  // Ask the server what changed there when the account is ready, when the app comes back and when the connection returns.
  watch([loaded, status, userId], () => void sync(), { immediate: true });
  let timer: ReturnType<typeof setInterval> | undefined;
  watch(
    waiting,
    (count) => {
      clearInterval(timer);
      timer = count > 0 ? setInterval(() => void flush(), RETRY_INTERVAL_MS) : undefined;
    },
    { immediate: true },
  );
  void App.addListener('appStateChange', ({ isActive }) => isActive && void sync());
  void Network.addListener('networkStatusChange', ({ connected }) => connected && void sync());

  // Sessions that waited for their equipment go up once it has.
  eq.onUploaded(() => void flush());
});

export function useLog() {
  return { loaded, sessions, equipment, renamed, waiting, failed, conflicts, goneSessions, ...actions };
}

