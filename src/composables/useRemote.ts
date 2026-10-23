import { t } from '@/i18n';
import { onScopeDispose, ref, watch, type Ref, type WatchSource } from 'vue';

export type Remote<T> = { data: Ref<T | null>; error: Ref<string | null>; loading: Ref<boolean>; reload: () => void };

type Options<T> = {
  /** Fetch again every this many ms while `keepPolling(data)` says so. */
  pollMs?: number;
  keepPolling?: (data: T) => boolean;
  /** Fetch again whenever one of these changes. */
  watch?: WatchSource[];
};

/** Loads something from the server on creation, again when a watched value changes or `reload` is called, and while polling. */
export function useRemote<T>(load: () => Promise<T | null>, options: Options<T> = {}): Remote<T> {
  const data = ref<T | null>(null) as Ref<T | null>;
  const error = ref<string | null>(null);
  const loading = ref(true);
  let latest: T | null = null;
  let generation = 0;

  async function run() {
    const mine = ++generation;
    try {
      const result = await load();
      if (mine !== generation) return;
      latest = result ?? latest;
      data.value = result ?? data.value;
      error.value = result ? null : t('common.couldNotLoad');
    } catch {
      if (mine !== generation) return;
      error.value = t('common.serverNotReachable');
    }
    loading.value = false;
  }

  void run();
  if (options.watch?.length) watch(options.watch, () => void run());

  const { pollMs, keepPolling } = options;
  if (pollMs && keepPolling) {
    const timer = setInterval(() => {
      if (latest !== null && keepPolling(latest)) void run();
    }, pollMs);
    onScopeDispose(() => clearInterval(timer));
  }
  onScopeDispose(() => generation++);

  return { data, error, loading, reload: () => void run() };
}
