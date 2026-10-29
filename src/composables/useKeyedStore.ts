import { computed, ref, type Ref, watch, type WatchSource } from 'vue';

import { dataStore } from '@/lib/local-store';

type Options<T> = {
  /** Where the data lives (see `storeKey`); null while there is no owner. */
  key: Ref<string | null>;
  empty: T;
  /** The current value, saved whenever `changes` fires. */
  read: () => T;
  /** Put a value in memory: what was loaded, or `empty` when the owner changes and `resetOnKeyChange` is set. */
  apply: (value: T) => void;
  changes: WatchSource;
  /** For a store that must not show the previous owner's data meanwhile. */
  resetOnKeyChange?: boolean;
};

/**
 * Loads the data of the current key from the device and saves it again after each change. `loaded` is true once the data
 * of the current key is in memory; nothing is saved before, so the empty start value cannot overwrite what is stored.
 */
export function useKeyedStore<T>(options: Options<T>) {
  const { key, empty, read, apply, changes, resetOnKeyChange } = options;
  const loadedKey = ref<string | null>(null);
  const loaded = computed(() => key.value !== null && loadedKey.value === key.value);
  let loading = 0;

  watch(
    key,
    async (next) => {
      if (resetOnKeyChange) {
        apply(empty);
        loadedKey.value = null;
      }
      if (!next) return;
      const mine = ++loading;
      const raw = await dataStore.get(next).catch(() => null);
      let value = empty;
      if (raw) {
        try {
          value = JSON.parse(raw) as T;
        } catch {
          // Unreadable: keep what was found next to it, so the next save does not destroy the only copy.
          await dataStore.set(`${next}.unreadable`, raw).catch(() => {});
        }
      }
      if (mine !== loading) return;
      apply(value);
      loadedKey.value = next;
    },
    { immediate: true },
  );

  watch([changes, loaded, key], () => {
    if (loaded.value && key.value) dataStore.set(key.value, JSON.stringify(read())).catch(() => {});
  });

  return { loaded };
}
