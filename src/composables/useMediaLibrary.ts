import { App } from '@capacitor/app';
import { computed, effectScope, ref, shallowRef, watch } from 'vue';

import { useAuth } from '@/composables/useAuth';
import { useKeyedStore } from '@/composables/useKeyedStore';
import { useLog } from '@/composables/useLog';
import { useMedia } from '@/composables/useMedia';
import { cachedThumbnailSrc, removeCachedThumbnails, saveCachedThumbnail } from '@/lib/media-files';
import { EMPTY_LIBRARY, type KnownMedia, type LibraryAction, type LibraryState, missingThumbnails, pullMedia, reduceLibrary, withoutLinks } from '@/lib/media-library';
import { storeKey } from '@/lib/store-owner';

// Your photos and videos as the server has them: the list and the thumbnails are kept on the phone, so the media screen
// works without a connection. The files stay on the server. Only your own: a coach reads the media of archers online.
const { api, storeOwner, status, userId } = useAuth();
const log = useLog();
const media = useMedia();

const storageKey = computed(() => (storeOwner.value ? storeKey('library', storeOwner.value) : null));
const state = shallowRef<LibraryState>(EMPTY_LIBRARY);
/** Links the page can show for the thumbnails on the phone. */
const thumbnails = ref<Readonly<Record<string, string>>>({});
let pulling = false;

function dispatch(action: LibraryAction) {
  state.value = reduceLibrary(state.value, action);
}

const { loaded } = effectScope(true).run(() =>
  useKeyedStore<LibraryState>({ key: storageKey, empty: EMPTY_LIBRARY, read: () => state.value, apply: (v) => (state.value = v), changes: state, resetOnKeyChange: true }),
)!;

async function showThumbnail(id: string) {
  const src = await cachedThumbnailSrc(id);
  if (src) thumbnails.value = { ...thumbnails.value, [id]: src };
}

/** Download the thumbnails that are not on the phone yet. `links` are fresh ones from this pull; for the rest the server is asked again. */
async function fetchThumbnails(links: Map<string, string>) {
  for (const item of missingThumbnails(state.value)) {
    try {
      const url = links.get(item.id) ?? (await api.GET('/api/media/{media_id}/', { params: { path: { media_id: item.id } } })).data?.thumbnail_url;
      if (!url) continue;
      const response = await fetch(url);
      if (!response.ok) continue;
      await saveCachedThumbnail(item.id, await response.blob());
      dispatch({ type: 'thumbnailSaved', id: item.id });
      await showThumbnail(item.id);
    } catch {
      return; // no connection: the rest waits for the next pull
    }
  }
}

/** What changed on the server since the last time, then the thumbnails. Before the uploads is not needed: queued items are not in this list. */
async function pull() {
  if (pulling || !loaded.value || status.value !== 'signedIn' || userId.value === null) return;
  pulling = true;
  try {
    const result = await pullMedia(api, Number(userId.value), state.value.lastPull);
    if (!result) return;
    const gone = new Set(result.gone);
    const removed = state.value.items.filter((m) => gone.has(m.id)).map((m) => m.id);
    dispatch({ type: 'pulled', changed: result.changed.map(withoutLinks), gone: result.gone, lastPull: result.lastPull });
    if (removed.length > 0) {
      thumbnails.value = Object.fromEntries(Object.entries(thumbnails.value).filter(([id]) => !gone.has(id)));
      void removeCachedThumbnails(removed);
    }
    await fetchThumbnails(new Map(result.changed.map((m) => [m.id, m.thumbnail_url])));
  } finally {
    pulling = false;
  }
}

/** Your photos and videos the phone knows, optionally of one session or none. */
function known(filter: { session?: string | null; withoutSession?: boolean } = {}): KnownMedia[] {
  return state.value.items.filter((m) => (filter.session ? m.session === filter.session : !filter.withoutSession || !m.session));
}

effectScope(true).run(() => {
  watch(loaded, (ready) => ready && void showThumbnails(), { immediate: true });
  watch([loaded, status], () => void pull(), { immediate: true });
  // An upload that finished is on the server now: learn it.
  watch(media.uploaded, () => void pull());
  void App.addListener('appStateChange', ({ isActive }) => isActive && void pull());
  // The media of an account that is deleted goes with it.
  log.onAccountDeleted(() => {
    void removeCachedThumbnails(state.value.items.map((m) => m.id));
    state.value = EMPTY_LIBRARY;
    thumbnails.value = {};
  });
});

async function showThumbnails() {
  for (const id of state.value.cached) await showThumbnail(id);
}

export function useMediaLibrary() {
  return { items: computed(() => state.value.items), thumbnails, known, pull, loaded };
}
