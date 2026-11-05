import { computed, effectScope, ref, shallowRef, watch } from 'vue';

import { addBeforeSignOut, useAuth } from '@/composables/useAuth';
import { useKeyedStore } from '@/composables/useKeyedStore';
import { useLog } from '@/composables/useLog';
import { useOnReconnect } from '@/composables/useOnReconnect';
import { dataStore } from '@/lib/local-store';
import { EMPTY_SCHEDULE, noteTeams, pulled, pullSchedule, type ScheduleCache } from '@/lib/schedule-cache';
import { storeKey } from '@/lib/store-owner';

// Your teams, their trainings from a month back to three months ahead, and the members of the teams you coach, kept on the
// phone (#104, phase 6): the Team tab, the agenda and the training suggestions work without a connection. Pulled whole on
// sign-in, when the app comes back to the front and when the connection returns (at most every five minutes, unless
// something was changed here). Removed on sign-out: it holds other people's names.
const MAX_AGE_MS = 5 * 60_000;

const { api, storeOwner, status } = useAuth();
const log = useLog();

// Only for an account: without one there is no schedule.
const storageKey = computed(() => (storeOwner.value?.kind === 'account' ? storeKey('schedule', storeOwner.value) : null));
const state = shallowRef<ScheduleCache>(EMPTY_SCHEDULE);
let triedAt = 0;
let pulling: Promise<void> | null = null;
/** Counts up after each pull that went through, for the screens that read the server themselves. */
const pulls = ref(0);

const keyed = effectScope(true).run(() =>
  useKeyedStore<ScheduleCache>({ key: storageKey, empty: EMPTY_SCHEDULE, read: () => state.value, apply: (v) => (state.value = { ...EMPTY_SCHEDULE, ...v }), changes: state, resetOnKeyChange: true }),
)!;
const { loaded } = keyed;

/** Fetch the schedule again unless the copy is fresh; `force` after a change made here. A failed pull keeps the copy. */
async function pull(force = false): Promise<void> {
  if (pulling) {
    await pulling;
    if (!force) return;
  }
  if (!loaded.value || status.value !== 'signedIn' || (!force && Date.now() - triedAt < MAX_AGE_MS)) return;
  const key = storageKey.value;
  triedAt = Date.now();
  pulling = (async () => {
    const at = new Date();
    const result = await pullSchedule(api, at);
    // Signed out or another account meanwhile: this answer is not theirs.
    if (key !== storageKey.value) return;
    if (!result) {
      triedAt = 0; // try again next time
      return;
    }
    state.value = pulled(result, at);
    pulls.value++;
  })();
  try {
    await pulling;
  } finally {
    pulling = null;
  }
}

/** Forget the copy on the phone, file included. */
async function remove() {
  const key = storageKey.value;
  keyed.hold();
  state.value = EMPTY_SCHEDULE;
  triedAt = 0;
  if (key) await dataStore.remove(key).catch(() => {});
}

/**
 * The teams in which you may write notes about `archer`: what the server says, or, when it cannot be reached, what the
 * copy says. Null if there is neither.
 */
async function writableTeams(archer: number): Promise<{ id: number; name: string }[] | null> {
  try {
    const { data } = await api.GET('/api/notes/teams/', { params: { query: { archer } } });
    if (data) return data;
  } catch {
    /* no connection: the copy below */
  }
  return loaded.value && state.value.pulledAt ? noteTeams(state.value, archer) : null;
}

effectScope(true).run(() => {
  watch(
    [loaded, status],
    ([ready, s]) => {
      if (ready && s === 'signedIn') void pull(true);
      else if (s !== 'signedIn') triedAt = 0;
    },
    { immediate: true },
  );
  useOnReconnect(() => void pull());
  addBeforeSignOut(remove);
  log.onAccountDeleted(() => void remove());
});

export function useScheduleCache() {
  return { state: computed(() => state.value), loaded, pull, pulls, writableTeams, remove };
}
