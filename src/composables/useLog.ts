import { App } from '@capacitor/app';
import { computed, effectScope, ref, shallowRef, watch } from 'vue';

import { useAuth } from '@/composables/useAuth';
import { useServer } from '@/composables/useServer';
import type { components } from '@/lib/api-types';
import { errorMessage } from '@/lib/errors';
import { localStore } from '@/lib/local-store';
import {
  EMPTY_LOG,
  type Environment,
  type Gear,
  type LogAction,
  type LogEnd,
  type LogState,
  type LogVolume,
  reduce,
  type SessionType,
} from '@/lib/log-model';
import { drain, fetchEquipment, send } from '@/lib/log-sync';
import { newId } from '@/lib/uuid';

const RETRY_INTERVAL_MS = 20_000;

export type DeletedCounts = components['schemas']['DeletedCounts'];

const { api, userId, status, signOut } = useAuth();
const { url } = useServer();

// Each user on each server has their own local log.
const storageKey = computed(() => (userId.value !== null ? `log:${url.value}:${userId.value}` : null));

const state = shallowRef<LogState>(EMPTY_LOG);
const loadedKey = ref<string | null>(null);
// This is the current truth, so the upload loop sees its own updates immediately.
let current: LogState = EMPTY_LOG;
let flushing = false;
// Uploads stop while the server erases your data, so a queued upload cannot bring it back.
let paused = false;
let inflight: Promise<void> | null = null;

function dispatch(action: LogAction) {
  current = reduce(current, action);
  state.value = current;
}

const loaded = computed(() => storageKey.value !== null && loadedKey.value === storageKey.value);
const waiting = computed(() => state.value.outbox.filter((o) => !o.error).length);
const failed = computed(() => state.value.outbox.filter((o) => o.error));
const sessions = computed(() => (loaded.value ? state.value.sessions : []));
const equipment = computed(() => state.value.equipment);

async function flush() {
  if (flushing || paused || !loaded.value || status.value !== 'signedIn') return;
  flushing = true;
  const run = drain(() => current, dispatch, (s, op) => send(api, s, op), () => paused);
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

async function deleteMyData(password: string, confirm: string): Promise<{ deleted: DeletedCounts } | { error: string }> {
  return withUploadsPaused(async () => {
    try {
      const { data, error } = await api.POST('/api/me/delete-data/', { body: { password, confirm } });
      if (!data) return { error: errorMessage(error) };
      dispatch({ type: 'reset' });
      return { deleted: data.deleted };
    } catch {
      return { error: 'Server not reachable. Nothing was deleted.' };
    }
  });
}

/** Deletes the account too; on success you are signed out, so the screen is gone when this returns. */
async function deleteMyAccount(password: string, confirm: string): Promise<{ error: string; teams: string[] }> {
  return withUploadsPaused(async () => {
    try {
      const { data, error } = await api.POST('/api/me/delete-account/', { body: { password, confirm } });
      if (!data) {
        const blocking = (error as { teams?: { name: string }[] } | undefined)?.teams ?? [];
        return { error: errorMessage(error), teams: blocking.map((t) => t.name) };
      }
      dispatch({ type: 'reset' });
      if (storageKey.value) await localStore.remove(storageKey.value).catch(() => {});
      await signOut(); // the account is gone: back to the sign-in screen
      return { error: '', teams: [] };
    } catch {
      return { error: 'Server not reachable. Nothing was deleted.', teams: [] };
    }
  });
}

// Your equipment is copied to the device whenever it is online, so a session can start at the range without a connection.
async function refreshEquipment() {
  if (!loaded.value || status.value !== 'signedIn' || userId.value === null) return;
  const fetched = await fetchEquipment(api, Number(userId.value));
  if (fetched) dispatch({ type: 'setEquipment', equipment: fetched });
}

function startSession(type: SessionType, environment: Environment, location: string, gear?: Gear, archer?: { id: number; name: string }): string {
  const id = newId();
  dispatch({
    type: 'startSession',
    session: {
      id, started_at: new Date().toISOString(), ended_at: null, type, environment, location, ends: [], volume: [],
      ...(gear ? { gear } : {}),
      ...(archer ? { owner: archer.id, owner_name: archer.name } : {}),
    },
  });
  return id;
}

const actions = {
  startSession,
  refreshEquipment,
  setGear: (id: string, gear: Gear) => dispatch({ type: 'updateSession', id, patch: { gear } }),
  finishSession: (id: string, finished: boolean) =>
    dispatch({ type: 'updateSession', id, patch: { ended_at: finished ? new Date().toISOString() : null } }),
  deleteSession: (id: string) => dispatch({ type: 'deleteSession', id }),
  saveEnd: (sessionId: string, end: LogEnd) => dispatch({ type: 'saveEnd', sessionId, end }),
  deleteEnd: (sessionId: string, endId: string) => dispatch({ type: 'deleteEnd', sessionId, endId }),
  saveVolume: (sessionId: string, entry: LogVolume) => dispatch({ type: 'saveVolume', sessionId, entry }),
  deleteVolume: (sessionId: string, entryId: string) => dispatch({ type: 'deleteVolume', sessionId, entryId }),
  retryFailed: () => {
    dispatch({ type: 'retryFailed' });
    void flush();
  },
  discardFailed: () => dispatch({ type: 'discardFailed' }),
  deleteMyData,
  deleteMyAccount,
};

// The log lives as long as the app: its watchers are never stopped.
effectScope(true).run(() => {
  let loading = 0;
  watch(
    storageKey,
    async (key) => {
      if (!key) return;
      const mine = ++loading;
      const loadedState = await localStore
        .get(key)
        .then((raw) => (raw ? (JSON.parse(raw) as LogState) : EMPTY_LOG))
        .catch(() => EMPTY_LOG);
      if (mine !== loading) return;
      dispatch({ type: 'load', state: loadedState });
      loadedKey.value = key;
    },
    { immediate: true },
  );

  watch([state, loaded, storageKey], () => {
    if (loaded.value && storageKey.value) localStore.set(storageKey.value, JSON.stringify(state.value)).catch(() => {});
  });

  // Upload whenever something new is queued, again every so often while something is waiting, and on return to the app.
  watch([() => state.value.outbox, loaded, status], () => void flush(), { immediate: true });
  let timer: ReturnType<typeof setInterval> | undefined;
  watch(
    waiting,
    (count) => {
      clearInterval(timer);
      timer = count > 0 ? setInterval(() => void flush(), RETRY_INTERVAL_MS) : undefined;
    },
    { immediate: true },
  );
  void App.addListener('appStateChange', ({ isActive }) => isActive && void flush());

  watch([loaded, status, userId], () => void refreshEquipment(), { immediate: true });
});

export function useLog() {
  return { loaded, sessions, equipment, waiting, failed, ...actions };
}

