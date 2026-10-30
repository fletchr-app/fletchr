import { computed, effectScope, ref, shallowRef, watch } from 'vue';

import { useAuth } from '@/composables/useAuth';
import { useKeyedStore } from '@/composables/useKeyedStore';
import { useLog } from '@/composables/useLog';
import { localStore } from '@/lib/local-store';
import { keepFiles, loadKept, removeFiles, removeKept } from '@/lib/media-files';
import { DEFAULT_CAP_MB, EMPTY_KEPT, evictions, type KeptAction, type KeptState, keptBytes, reduceKept } from '@/lib/media-keep';
import type { MediaFiles } from '@/lib/media-queue';
import { storeKey } from '@/lib/store-owner';

// Your photos and clips stay on the phone after they went up, up to a limit that is set in Settings. The oldest unused
// go first. What still waits to upload is not here: the queue keeps those files, and nothing here deletes them.
const { storeOwner } = useAuth();
const log = useLog();

const CAP_KEY = 'keptCapMb';
const storageKey = computed(() => (storeOwner.value ? storeKey('kept', storeOwner.value) : null));
const state = shallowRef<KeptState>(EMPTY_KEPT);
/** In MB; 0 keeps nothing, null has no limit. */
const capMb = ref<number | null>(DEFAULT_CAP_MB);
/** What is on screen now: not removed to make room. */
const open = new Set<string>();

function dispatch(action: KeptAction) {
  state.value = reduceKept(state.value, action);
}

const { loaded } = effectScope(true).run(() =>
  useKeyedStore<KeptState>({ key: storageKey, empty: EMPTY_KEPT, read: () => state.value, apply: (v) => (state.value = v), changes: state, resetOnKeyChange: true }),
)!;

function makeRoom() {
  const out = evictions(state.value, capMb.value, open);
  if (out.length === 0) return;
  dispatch({ type: 'forget', ids: out });
  void removeKept(out);
}

/** An item went up: keep its files (or delete them when the limit is 0). */
async function keep(id: string) {
  if (capMb.value === 0 || !loaded.value) return void (await removeFiles(id));
  const size = await keepFiles(id);
  if (size === null) return;
  dispatch({ type: 'kept', id, size, at: new Date().toISOString() });
  makeRoom();
}

const has = (id: string) => state.value.items.some((i) => i.id === id);

/** The files of a kept item, marked as used now. Null if they are not on the phone (any more). */
async function load(id: string, fileType: string): Promise<MediaFiles | null> {
  if (!has(id)) return null;
  try {
    const files = await loadKept(id, fileType);
    dispatch({ type: 'used', id, at: new Date().toISOString() });
    return files;
  } catch {
    dispatch({ type: 'forget', ids: [id] }); // the file is gone
    return null;
  }
}

/** The item was deleted, or the server no longer has it. */
function forget(ids: string[]) {
  const mine = ids.filter(has);
  if (mine.length === 0) return;
  dispatch({ type: 'forget', ids: mine });
  void removeKept(mine);
}

function clear() {
  const ids = state.value.items.map((i) => i.id);
  dispatch({ type: 'clear' });
  void removeKept(ids);
}

function setCap(mb: number | null) {
  capMb.value = mb;
  void localStore.set(CAP_KEY, mb === null ? 'none' : String(mb));
  makeRoom();
}

effectScope(true).run(() => {
  void localStore.get(CAP_KEY).then((saved) => {
    if (saved === 'none') capMb.value = null;
    else if (saved !== null && saved !== undefined && Number.isFinite(Number(saved))) capMb.value = Number(saved);
  });
  watch(loaded, (ready) => ready && makeRoom());
  log.onAccountDeleted(clear);
});

export function useKeptMedia() {
  return {
    keep,
    has,
    load,
    forget,
    clear,
    setCap,
    capMb,
    bytes: computed(() => keptBytes(state.value)),
    count: computed(() => state.value.items.length),
    /** Keep this item whatever the limit says while it is on screen. */
    hold: (id: string) => open.add(id),
    release: (id: string) => open.delete(id),
  };
}
