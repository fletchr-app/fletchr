import { computed, effectScope, ref, shallowRef, watch } from 'vue';

import { useAuth } from '@/composables/useAuth';
import { useKeyedStore } from '@/composables/useKeyedStore';
import { useLog } from '@/composables/useLog';
import { useMedia } from '@/composables/useMedia';
import { useOnReconnect } from '@/composables/useOnReconnect';
import { useServerVersion } from '@/composables/useServer';
import { drainEvaluations, sendEvaluation } from '@/lib/evaluation-sync';
import { EMPTY_EVALUATIONS, type EvaluationAction, type EvaluationsState, evidenceOf, pendingEvaluations, type QueuedEvaluation, reduce } from '@/lib/evaluation-store';
import { storeKey } from '@/lib/store-owner';
import { newId } from '@/lib/uuid';
import { compareVersions, parseVersion } from '@/lib/version';

// Evaluations written on this device that have not reached the server yet (#84). They go up with a repeatable `PUT`, after
// the photo or clip they name as evidence, and then leave this list: the server's list shows them. A change to an
// evaluation the server has goes the same way (its uid, the whole form).
const RETRY_INTERVAL_MS = 20_000;

/** The first server version with `PUT /api/evaluations/{uid}/`. An older one still takes the online form. */
export const QUEUE_SINCE: [number, number, number] = [0, 26, 0];

const { api, storeOwner, status, isLocal } = useAuth();
const log = useLog();
const media = useMedia();
const serverVersion = useServerVersion();

// Only for an account: without one there are no evaluations.
const storageKey = computed(() => (storeOwner.value?.kind === 'account' ? storeKey('evaluations', storeOwner.value) : null));
const state = shallowRef<EvaluationsState>(EMPTY_EVALUATIONS);
let current: EvaluationsState = EMPTY_EVALUATIONS;
let flushing: Promise<void> | null = null;
/** Counts up whenever an evaluation went up, so the screens that show the server's list can fetch it again. */
const uploaded = ref(0);
/** The number the server gave each evaluation that went up in this run of the app, by uid. */
const savedIds = new Map<string, number>();

function dispatch(action: EvaluationAction) {
  current = reduce(current, action);
  state.value = current;
}

const keyed = effectScope(true).run(() =>
  useKeyedStore<EvaluationsState>({
    key: storageKey,
    empty: EMPTY_EVALUATIONS,
    read: () => state.value,
    apply: (value) => dispatch({ type: 'load', state: value }),
    changes: state,
    resetOnKeyChange: true,
  }),
)!;
const { loaded } = keyed;

const evaluations = computed(() => (loaded.value ? state.value.evaluations : []));
const waiting = computed(() => (isLocal.value ? 0 : evaluations.value.filter((e) => !e.error).length));
const failed = computed(() => (isLocal.value ? [] : evaluations.value.filter((e) => e.error)));

/**
 * Whether an evaluation is written through the queue. An older server (known to be one) has no route for it. A server
 * that cannot be reached says nothing, which is the very case the queue is for.
 */
const queueing = computed(() => {
  const v = serverVersion.value ? parseVersion(serverVersion.value) : null;
  return !v || compareVersions(v, QUEUE_SINCE) >= 0;
});

/** The clip or photo an evaluation names as evidence has not gone up yet. */
const blocked = (evaluation: QueuedEvaluation): boolean => evidenceOf(evaluation).some((id) => media.items.value.some((i) => i.id === id && !i.uploaded));

function flush(): Promise<void> {
  if (flushing) return flushing;
  if (!loaded.value || status.value !== 'signedIn') return Promise.resolve();
  flushing = (async () => {
    try {
      await drainEvaluations(
        () => current,
        (action) => {
          if (action.type === 'remove') uploaded.value++;
          dispatch(action);
        },
        async (evaluation) => {
          const result = await sendEvaluation(api, evaluation);
          if (result.kind === 'ok') savedIds.set(evaluation.uid, result.id);
          return result;
        },
        blocked,
      );
    } finally {
      flushing = null;
    }
  })();
  return flushing;
}

/**
 * Write an evaluation: saved on the device at once, sent when it can be. Waits for the first try and gives the number the
 * server gave it, or null when it is still waiting (no connection, or its clip is not up yet). `uid` is the evaluation's
 * own when it is changed. When the server refuses it right away the person is still at the form: the evaluation is taken
 * out of the queue again and the server's words come back as `error`, so they can put it right.
 */
async function save(
  evaluation: Omit<QueuedEvaluation, 'uid' | 'created_at' | 'error' | 'gone'> & { uid?: string },
): Promise<{ uid: string; id: number | null; error?: string }> {
  const uid = evaluation.uid ?? newId();
  dispatch({ type: 'add', evaluation: { ...evaluation, uid, created_at: new Date().toISOString() } });
  await flush();
  const refused = current.evaluations.find((e) => e.uid === uid)?.error;
  if (refused) {
    dispatch({ type: 'remove', uid });
    return { uid, id: null, error: refused };
  }
  return { uid, id: savedIds.get(uid) ?? null };
}

const actions = {
  save,
  pendingFor: (archer: number) => pendingEvaluations({ evaluations: evaluations.value }, archer),
  retryFailed: () => {
    dispatch({ type: 'retryFailed', fresh: newId });
    void flush();
  },
  discardFailed: () => dispatch({ type: 'discardFailed' }),
};

// The queue lives as long as the app: its watchers are never stopped.
effectScope(true).run(() => {
  // Also when something the evaluations wait for has gone up.
  watch([() => state.value.evaluations, loaded, status, () => media.waiting.value.length], () => void flush(), { immediate: true });
  let timer: ReturnType<typeof setInterval> | undefined;
  watch(
    waiting,
    (count) => {
      clearInterval(timer);
      timer = count > 0 ? setInterval(() => void flush(), RETRY_INTERVAL_MS) : undefined;
    },
    { immediate: true },
  );
  useOnReconnect(() => void flush());
  // The account is gone: so are the evaluations that were still on the way for it.
  log.onAccountDeleted(() => dispatch({ type: 'reset' }));
});

export function useEvaluations() {
  return { loaded, evaluations, waiting, failed, uploaded, queueing, keyed, ...actions };
}
