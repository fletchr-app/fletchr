import { App } from '@capacitor/app';
import { computed, effectScope, ref, shallowRef, watch } from 'vue';

import { useAuth } from '@/composables/useAuth';
import { useLog } from '@/composables/useLog';
import { useServer } from '@/composables/useServer';
import { t } from '@/i18n';
import { localStore } from '@/lib/local-store';
import { loadFiles, removeFiles, saveFiles } from '@/lib/media-files';
import { drainMedia, type MediaFiles, type QueuedMedia, sendMedia } from '@/lib/media-queue';
import { newId } from '@/lib/uuid';

// Photos and videos waiting to be uploaded, kept on the device like the training log and sent whenever there is a connection.
const RETRY_INTERVAL_MS = 20_000;

const { api, userId, status } = useAuth();
const { url } = useServer();
const log = useLog();

const storageKey = computed(() => (userId.value !== null ? `media:${url.value}:${userId.value}` : null));
const items = shallowRef<QueuedMedia[]>([]);
const loadedKey = ref<string | null>(null);
/** Counts up whenever an upload finished, so a screen that shows the server's list can fetch it again. */
const uploaded = ref(0);
let flushing = false;

const loaded = computed(() => storageKey.value !== null && loadedKey.value === storageKey.value);
const waiting = computed(() => items.value.filter((i) => !i.error));
const failed = computed(() => items.value.filter((i) => i.error));

function set(next: QueuedMedia[]) {
  items.value = next;
}

async function flush() {
  if (flushing || !loaded.value || status.value !== 'signedIn') return;
  flushing = true;
  try {
    await drainMedia({
      items: () => items.value,
      done: (id) => {
        set(items.value.filter((i) => i.id !== id));
        void removeFiles(id);
        uploaded.value++;
      },
      fail: (id, message) => set(items.value.map((i) => (i.id === id ? { ...i, error: message } : i))),
      dropSession: (id) => set(items.value.map((i) => (i.id === id ? { ...i, session: null } : i))),
      blocked: (item) => item.session !== null && log.sessionWaiting(item.session),
      send: async (item) => {
        let files: MediaFiles;
        try {
          files = await loadFiles(item.id, item.kind === 'video' ? 'video/mp4' : 'image/jpeg');
        } catch {
          return { kind: 'failed', message: t('media.fileLost') };
        }
        return sendMedia(api, item, files);
      },
    });
  } finally {
    flushing = false;
  }
}

/** Keep the files on the device and queue the upload. Resolves when they are safe, not when they are uploaded. */
async function enqueue(meta: Omit<QueuedMedia, 'id' | 'error'>, files: MediaFiles): Promise<string> {
  const id = newId();
  await saveFiles(id, files);
  set([...items.value, { id, ...meta }]);
  void flush();
  return id;
}

function remove(id: string) {
  set(items.value.filter((i) => i.id !== id));
  void removeFiles(id);
}

const actions = {
  enqueue,
  remove,
  retryFailed: () => {
    set(items.value.map(({ error: _, ...rest }) => rest));
    void flush();
  },
  discardFailed: () => failed.value.forEach((i) => remove(i.id)),
  discardAll: () => items.value.forEach((i) => remove(i.id)),
};

effectScope(true).run(() => {
  let loading = 0;
  watch(
    storageKey,
    async (key) => {
      if (!key) return;
      const mine = ++loading;
      const stored = await localStore
        .get(key)
        .then((raw) => (raw ? (JSON.parse(raw) as QueuedMedia[]) : []))
        .catch(() => []);
      if (mine !== loading) return;
      set(stored);
      loadedKey.value = key;
    },
    { immediate: true },
  );
  watch([items, loaded, storageKey], () => {
    if (loaded.value && storageKey.value) localStore.set(storageKey.value, JSON.stringify(items.value)).catch(() => {});
  });

  watch([items, loaded, status], () => void flush(), { immediate: true });
  let timer: ReturnType<typeof setInterval> | undefined;
  watch(
    () => waiting.value.length,
    (count) => {
      clearInterval(timer);
      timer = count > 0 ? setInterval(() => void flush(), RETRY_INTERVAL_MS) : undefined;
    },
    { immediate: true },
  );
  void App.addListener('appStateChange', ({ isActive }) => isActive && void flush());
});

export function useMedia() {
  return { items, waiting, failed, uploaded, ...actions };
}
