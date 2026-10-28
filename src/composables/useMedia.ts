import { App } from '@capacitor/app';
import { Network } from '@capacitor/network';
import { computed, effectScope, ref, shallowRef, watch } from 'vue';

import { useAuth } from '@/composables/useAuth';
import { useLog } from '@/composables/useLog';
import { useUploadSettings } from '@/composables/useUploadSettings';
import { useServer } from '@/composables/useServer';
import { t } from '@/i18n';
import { localStore } from '@/lib/local-store';
import { loadFiles, removeFiles, saveFiles } from '@/lib/media-files';
import { drainMedia, type MediaFiles, type QueuedMedia, renameSession, sendMedia } from '@/lib/media-queue';
import { newId } from '@/lib/uuid';

// Photos and videos waiting to be uploaded, kept on the device like the training log and sent whenever there is a connection.
const RETRY_INTERVAL_MS = 20_000;

const { api, userId, status } = useAuth();
const { url } = useServer();
const log = useLog();
const { videosWifiOnly } = useUploadSettings();

const storageKey = computed(() => (userId.value !== null ? `media:${url.value}:${userId.value}` : null));
const items = shallowRef<QueuedMedia[]>([]);
const loadedKey = ref<string | null>(null);
/** Counts up whenever an upload finished, so a screen that shows the server's list can fetch it again. */
const uploaded = ref(0);
let flushing = false;
/** Not on mobile data. Where the connection type is not known (the browser) uploads are not held back. */
const onWifi = ref(true);

const loaded = computed(() => storageKey.value !== null && loadedKey.value === storageKey.value);
const waiting = computed(() => items.value.filter((i) => !i.error));
const failed = computed(() => items.value.filter((i) => i.error));

function set(next: QueuedMedia[]) {
  items.value = next;
}

/** A video waits for Wi-Fi when the setting says so; photos are small and go at once. */
function waitsForWifi(item: QueuedMedia): boolean {
  return item.kind === 'video' && videosWifiOnly.value && !onWifi.value;
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
      blocked: (item) => (item.session !== null && log.sessionWaiting(item.session)) || waitsForWifi(item),
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
  enqueueStored({ id, ...meta });
  return id;
}

/** Queue a clip whose files are in the queue's folder already (the video plugin wrote them). */
function enqueueStored(item: Omit<QueuedMedia, 'error'>) {
  set([...items.value, item]);
  void flush();
}

function remove(id: string) {
  set(items.value.filter((i) => i.id !== id));
  void removeFiles(id);
}

const actions = {
  enqueue,
  enqueueStored,
  /** Videos that wait because the phone is on mobile data. */
  waitingForWifi: () => items.value.filter((i) => !i.error && waitsForWifi(i)).length,
  remove,
  retryFailed: () => {
    set(items.value.map(({ error: _, ...rest }) => rest));
    void flush();
  },
  discardFailed: () => failed.value.forEach((i) => remove(i.id)),
  discardAll: () => items.value.forEach((i) => remove(i.id)),
};

effectScope(true).run(() => {
  // Clips queued for a session the server merged into another one follow it.
  log.onSessionRenamed((from, to) => set(renameSession(items.value, from, to)));
  let loading = 0;
  watch(
    storageKey,
    async (key) => {
      // Another account (or none): what is in memory belongs to the one before. Its queue stays on the device under its own key.
      set([]);
      loadedKey.value = null;
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

  // The connection type: a video held back for Wi-Fi goes when the phone joins one, or when the setting changes.
  const setConnection = (type: string) => (onWifi.value = type !== 'cellular');
  void Network.getStatus().then((s) => setConnection(s.connectionType)).catch(() => {});
  void Network.addListener('networkStatusChange', (s) => setConnection(s.connectionType));
  watch([onWifi, videosWifiOnly], () => void flush());
});

export function useMedia() {
  return { items, waiting, failed, uploaded, ...actions };
}
