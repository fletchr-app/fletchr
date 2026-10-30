import { App } from '@capacitor/app';
import { Network } from '@capacitor/network';
import { computed, effectScope, ref, shallowRef, watch } from 'vue';

import { useAuth } from '@/composables/useAuth';
import { useKeyedStore } from '@/composables/useKeyedStore';
import { useKeptMedia } from '@/composables/useKeptMedia';
import { useLog } from '@/composables/useLog';
import { useUploadSettings } from '@/composables/useUploadSettings';
import { t } from '@/i18n';
import { loadFiles, removeFiles, saveFiles } from '@/lib/media-files';
import { storeKey } from '@/lib/store-owner';
import { afterUpload, drainMedia, type MediaFiles, moveQueued, type QueuedMedia, renameSession, sendMedia } from '@/lib/media-queue';
import { newId } from '@/lib/uuid';

// Photos and videos waiting to be uploaded, kept on the device like the training log and sent whenever there is a connection.
const RETRY_INTERVAL_MS = 20_000;

const { api, storeOwner, status, isLocal, userId } = useAuth();
const log = useLog();
const kept = useKeptMedia();
const { videosWifiOnly } = useUploadSettings();

const storageKey = computed(() => (storeOwner.value ? storeKey('media', storeOwner.value) : null));
const items = shallowRef<QueuedMedia[]>([]);
/** Counts up whenever an upload finished, so a screen that shows the server's list can fetch it again. */
const uploaded = ref(0);
let flushing = false;
/** Not on mobile data. Where the connection type is not known (the browser) uploads are not held back. */
const onWifi = ref(true);

// Another account (or none): what is in memory belongs to the one before. Its queue stays on the device under its own key.
const { loaded } = effectScope(true).run(() =>
  useKeyedStore<QueuedMedia[]>({ key: storageKey, empty: [], read: () => items.value, apply: set, changes: items, resetOnKeyChange: true }),
)!;
// Without an account nothing is uploaded, so nothing is waiting.
const waiting = computed(() => (isLocal.value ? [] : items.value.filter((i) => !i.error)));
const failed = computed(() => (isLocal.value ? [] : items.value.filter((i) => i.error)));

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
      done: (sent) => {
        set(afterUpload(items.value, sent));
        // An item that was moved during its upload stays (without its files) until the server knows the session.
        // Your own go to the kept files (Settings sets how many); what you took for an archer is not yours to keep.
        if (!items.value.some((i) => i.id === sent.id)) void (sent.owner === null || sent.owner === Number(userId.value) ? kept.keep(sent.id) : removeFiles(sent.id));
        uploaded.value++;
      },
      fail: (id, message) => set(items.value.map((i) => (i.id === id ? { ...i, error: message } : i))),
      dropSession: (id) => set(items.value.map((i) => (i.id === id ? { ...i, session: null } : i))),
      dropEvent: (id) => set(items.value.map((i) => (i.id === id ? { ...i, event: undefined } : i))),
      blocked: (item) => (item.session !== null && log.sessionWaiting(item.session)) || waitsForWifi(item),
      send: async (item) => {
        if (item.uploaded) return sendMedia(api, item, null);
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
  /** Queued items go to another session (null: none); an item that is being uploaded right now follows after its upload. */
  move: (ids: string[], session: string | null) => set(moveQueued(items.value, ids, session)),
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
  // Photos and videos still waiting would bring back data of an account that no longer exists, and the files stay on the phone.
  log.onAccountDeleted(() => items.value.forEach((i) => remove(i.id)));
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
