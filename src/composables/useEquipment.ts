import { App } from '@capacitor/app';
import { Network } from '@capacitor/network';
import { computed, effectScope, shallowRef, watch } from 'vue';

import { useAuth } from '@/composables/useAuth';
import { useKeyedStore } from '@/composables/useKeyedStore';
import {
  EMPTY_EQUIPMENT,
  type EquipmentAction,
  type EquipmentKind,
  type EquipmentState,
  fieldsOf,
  findItem,
  itemsOf,
  reduce,
  revisionPending,
  sessionEquipment,
  type StoredItem,
  type StoredRevision,
  type Values,
} from '@/lib/equipment-store';
import { drainEquipment, pullEquipment, sendEquipment } from '@/lib/equipment-sync';
import { storeKey } from '@/lib/store-owner';
import { newId } from '@/lib/uuid';

// Your bows and arrow sets, kept on the device: made and changed without a connection, uploaded when there is one, and
// read from the server whenever the app is online. The session screens choose from this copy.
const RETRY_INTERVAL_MS = 20_000;

const { api, userId, storeOwner, status, isLocal } = useAuth();

const storageKey = computed(() => (storeOwner.value ? storeKey('equipment', storeOwner.value) : null));
const state = shallowRef<EquipmentState>(EMPTY_EQUIPMENT);
// This is the current truth, so the upload loop sees its own updates immediately.
let current: EquipmentState = EMPTY_EQUIPMENT;
let flushing = false;
let pulling = false;
/** Counts up whenever an upload finished, so a pull that was already on its way does not bring back the values from before it. */
let uploads = 0;
const uploadedListeners: (() => void)[] = [];

function dispatch(action: EquipmentAction) {
  current = reduce(current, action);
  state.value = current;
}

const keyed = effectScope(true).run(() =>
  useKeyedStore<EquipmentState>({
    key: storageKey,
    empty: EMPTY_EQUIPMENT,
    read: () => state.value,
    apply: (value) => dispatch({ type: 'load', state: value }),
    changes: state,
    resetOnKeyChange: true,
  }),
)!;
const { loaded } = keyed;

const bows = computed(() => (loaded.value ? itemsOf(state.value, 'bow') : []));
const arrowSets = computed(() => (loaded.value ? itemsOf(state.value, 'arrowSet') : []));
/** The active items in the shape of the session screens. */
const equipment = computed(() => sessionEquipment(loaded.value ? state.value : EMPTY_EQUIPMENT));
const waiting = computed(() => (isLocal.value ? 0 : state.value.outbox.filter((o) => !o.error).length));
const failed = computed(() => (isLocal.value ? [] : state.value.outbox.filter((o) => o.error)));
/** Nothing known yet: a copy from before there was a store may still be better than an empty list. */
const empty = computed(() => state.value.items.length === 0);

async function flush() {
  if (flushing || !loaded.value || status.value !== 'signedIn') return;
  flushing = true;
  try {
    await drainEquipment(
      () => current,
      (action) => {
        if (action.type === 'opDone') uploads++;
        dispatch(action);
      },
      (s, op) => sendEquipment(api, s, op),
    );
  } finally {
    flushing = false;
  }
  uploadedListeners.forEach((listener) => listener());
}

/** Read the server's list into the store. Items with a change waiting keep the phone's version. */
async function refresh() {
  if (pulling || !loaded.value || status.value !== 'signedIn' || userId.value === null) return;
  pulling = true;
  const before = uploads;
  try {
    const items = await pullEquipment(api, Number(userId.value));
    // An upload that finished meanwhile is newer than this answer.
    if (items && uploads === before && !flushing) dispatch({ type: 'pulled', items });
  } finally {
    pulling = false;
  }
}

/** Make an item (new when `uid` is null) or change one. Returns its uid. */
function save(kind: EquipmentKind, uid: string | null, values: Values, isActive: boolean): string {
  const id = uid ?? newId();
  dispatch({ type: 'save', kind, uid: id, values, is_active: isActive, now: new Date().toISOString(), revisionUid: newId() });
  return id;
}

type ServerRevision = { uid: string; id: number; number: number; created_at: string } & Record<string, unknown>;

/** The history of an item: the server's list when it can be reached, with what is still waiting to upload on top. */
async function revisionsOf(kind: EquipmentKind, uid: string): Promise<StoredRevision[]> {
  const item = findItem(current, kind, uid);
  if (!item) return [];
  const local = item.revisions;
  if (item.id === undefined) return local;
  try {
    const { data } =
      kind === 'bow'
        ? await api.GET('/api/bows/{id}/revisions/', { params: { path: { id: item.id } } })
        : await api.GET('/api/arrow-sets/{id}/revisions/', { params: { path: { id: item.id } } });
    if (!data) return local;
    const fromServer = (data as unknown as ServerRevision[]).map(
      (r): StoredRevision => ({
        uid: r.uid,
        id: r.id,
        number: r.number,
        created_at: r.created_at,
        values: Object.fromEntries(fieldsOf(kind).map((f) => [f.key, r[f.key] == null ? null : (r[f.key] as string | number)])),
      }),
    );
    const known = new Set(fromServer.map((r) => r.uid));
    return [...local.filter((r) => !known.has(r.uid)), ...fromServer].sort((a, b) => b.number - a.number);
  } catch {
    return local;
  }
}

const actions = {
  save,
  /** Everything the store holds, for the export of a person without an account. */
  allItems: () => state.value.items,
  importItems: (items: StoredItem[]) => dispatch({ type: 'imported', items }),
  remove: (kind: EquipmentKind, uid: string) => dispatch({ type: 'remove', kind, uid }),
  find: (kind: EquipmentKind, uid: string) => findItem(state.value, kind, uid),
  revisionsOf,
  refresh,
  revisionPending: (uid: string) => revisionPending(current, uid),
  /** Called after each round of uploading, so the sessions that were waiting for their equipment can go up. */
  onUploaded: (listener: () => void) => void uploadedListeners.push(listener),
  retryFailed: () => {
    dispatch({ type: 'retryFailed' });
    void flush();
  },
  discardFailed: () => {
    dispatch({ type: 'discardFailed' });
    void refresh(); // what the server refused (say, deleting a bow that was used) comes back as the server has it
  },
};

// The store lives as long as the app: its watchers are never stopped.
effectScope(true).run(() => {
  watch([() => state.value.outbox, loaded, status], () => void flush(), { immediate: true });
  // Ask the server what it has when the account is ready, when the app comes back and when the connection returns.
  watch([loaded, status, userId], () => void refresh(), { immediate: true });
  let timer: ReturnType<typeof setInterval> | undefined;
  watch(
    waiting,
    (count) => {
      clearInterval(timer);
      timer = count > 0 ? setInterval(() => void flush(), RETRY_INTERVAL_MS) : undefined;
    },
    { immediate: true },
  );
  void App.addListener('appStateChange', ({ isActive }) => isActive && void refresh());
  void Network.addListener('networkStatusChange', ({ connected }) => connected && void refresh());
});

export function useEquipment() {
  return { loaded, bows, arrowSets, equipment, empty, waiting, failed, keyed, ...actions };
}
