import { computed, effectScope, ref, shallowRef, watch } from 'vue';

import { addBeforeSignOut, useAuth } from '@/composables/useAuth';
import { useEvaluations } from '@/composables/useEvaluations';
import { useKeyedStore } from '@/composables/useKeyedStore';
import { useLog } from '@/composables/useLog';
import { useOnReconnect } from '@/composables/useOnReconnect';
import {
  EMPTY_EVALUATION_LIBRARY,
  type EvaluationLibraryAction,
  type EvaluationLibraryState,
  type EvaluationQuery,
  isKept,
  type KnownEvaluation,
  pullEvaluations,
  reduceEvaluationLibrary,
  selectEvaluations,
} from '@/lib/evaluation-library';
import { dataStore } from '@/lib/local-store';
import { storeKey } from '@/lib/store-owner';

// The evaluations about you and by you, kept on the phone to read them without a connection (#84). Writing one or a
// change goes through the queue (`useEvaluations`); deleting and changing who reads it still needs the server. A coach
// reads the evaluations of others online only, only their own are kept. Removed on sign-out: it holds ratings of people.
const { api, storeOwner, status, userId } = useAuth();
const log = useLog();
const queue = useEvaluations();

// Only for an account: without one there are no evaluations.
const storageKey = computed(() => (storeOwner.value?.kind === 'account' ? storeKey('evaluation-library', storeOwner.value) : null));
const state = shallowRef<EvaluationLibraryState>(EMPTY_EVALUATION_LIBRARY);
/** True when the last thing a screen asked for came from the phone because the server could not be reached. */
const offline = ref(false);
let pulling = false;

function dispatch(action: EvaluationLibraryAction) {
  state.value = reduceEvaluationLibrary(state.value, action);
}

const keyed = effectScope(true).run(() =>
  useKeyedStore<EvaluationLibraryState>({ key: storageKey, empty: EMPTY_EVALUATION_LIBRARY, read: () => state.value, apply: (v) => (state.value = v), changes: state, resetOnKeyChange: true }),
)!;
const { loaded } = keyed;

/** What changed on the server since the last time. */
async function pull() {
  if (pulling || !loaded.value || status.value !== 'signedIn' || userId.value === null) return;
  pulling = true;
  try {
    const result = await pullEvaluations(api, Number(userId.value), state.value.lastPull);
    if (result) dispatch({ type: 'pulled', changed: result.changed, gone: result.gone, lastPull: result.lastPull });
  } finally {
    pulling = false;
  }
}

/** What was just read from the server is the newest there is: an evaluation changed here shows changed offline too. */
function remember(list: KnownEvaluation[]) {
  const mine = list.filter((e) => isKept(e, Number(userId.value)));
  if (mine.length > 0 && loaded.value) dispatch({ type: 'saved', evaluations: mine });
}

/** The evaluations the server lists for this query, or, when it cannot be reached, the copy on the phone. Null if there is neither. */
async function list(query: EvaluationQuery): Promise<KnownEvaluation[] | null> {
  try {
    const { data } = await api.GET('/api/evaluations/', { params: { query } });
    if (data) {
      offline.value = false;
      remember(data);
      return data;
    }
  } catch {
    /* no connection: the copy below */
  }
  if (!loaded.value) return null;
  offline.value = true;
  return selectEvaluations(state.value, query);
}

/** One evaluation by the server's number: from the server, or the copy. Null if the server has no such one; throws when there is neither. */
async function get(id: number): Promise<KnownEvaluation | null> {
  try {
    const { data, response } = await api.GET('/api/evaluations/{id}/', { params: { path: { id } } });
    if (data) {
      offline.value = false;
      remember([data]);
      return data;
    }
    if (response.status < 500) return null;
  } catch {
    /* no connection: the copy below */
  }
  const copy = loaded.value ? state.value.evaluations.find((e) => e.id === id) : undefined;
  if (!copy) throw new Error('server not reachable');
  offline.value = true;
  return copy;
}

/** Forget the copy on the phone, file included. */
async function remove() {
  const key = storageKey.value;
  keyed.hold();
  state.value = EMPTY_EVALUATION_LIBRARY;
  offline.value = false;
  if (key) await dataStore.remove(key).catch(() => {});
}

effectScope(true).run(() => {
  watch([loaded, status], () => void pull(), { immediate: true });
  // An evaluation that went up is on the server now: learn it.
  watch(queue.uploaded, () => void pull());
  // Back in the app, or the connection is back: learn what changed meanwhile.
  useOnReconnect(() => void pull());
  addBeforeSignOut(remove);
  log.onAccountDeleted(() => void remove());
});

export function useEvaluationLibrary() {
  return { list, get, pull, offline, loaded, remove };
}
