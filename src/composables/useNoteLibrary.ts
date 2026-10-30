import { App } from '@capacitor/app';
import { computed, effectScope, ref, shallowRef, watch } from 'vue';

import { useAuth } from '@/composables/useAuth';
import { useKeyedStore } from '@/composables/useKeyedStore';
import { useLog } from '@/composables/useLog';
import { useMediaLibrary } from '@/composables/useMediaLibrary';
import { useNotes } from '@/composables/useNotes';
import {
  EMPTY_NOTE_LIBRARY,
  isKept,
  type KnownNote,
  type NoteLibraryAction,
  type NoteLibraryState,
  type NoteQuery,
  pullNotes,
  reduceNoteLibrary,
  selectNotes,
  serverQuery,
} from '@/lib/note-library';
import { storeKey } from '@/lib/store-owner';

// The notes about you and by you, kept on the phone to read them without a connection. Changing and deleting a note
// still needs the server. A coach reads the notes of others online only, only their own are kept.
const { api, storeOwner, status, userId } = useAuth();
const log = useLog();
const notes = useNotes();
const mediaLibrary = useMediaLibrary();

const storageKey = computed(() => (storeOwner.value ? storeKey('note-library', storeOwner.value) : null));
const state = shallowRef<NoteLibraryState>(EMPTY_NOTE_LIBRARY);
/** True when the last list a screen asked for came from the phone because the server could not be reached. */
const offline = ref(false);
let pulling = false;

function dispatch(action: NoteLibraryAction) {
  state.value = reduceNoteLibrary(state.value, action);
}

const { loaded } = effectScope(true).run(() =>
  useKeyedStore<NoteLibraryState>({ key: storageKey, empty: EMPTY_NOTE_LIBRARY, read: () => state.value, apply: (v) => (state.value = v), changes: state, resetOnKeyChange: true }),
)!;

/** What changed on the server since the last time. Notes in the upload queue are not in this list and are left alone. */
async function pull() {
  if (pulling || !loaded.value || status.value !== 'signedIn' || userId.value === null) return;
  pulling = true;
  try {
    const result = await pullNotes(api, Number(userId.value), state.value.lastPull);
    if (result) dispatch({ type: 'pulled', changed: result.changed, gone: result.gone, lastPull: result.lastPull });
  } finally {
    pulling = false;
  }
}

/** Offline, a note shows the small picture the phone kept, not the link that has run out. */
function withKeptPicture(note: KnownNote): KnownNote {
  const kept = note.media ? mediaLibrary.thumbnails.value[note.media] : undefined;
  return kept && note.picture ? { ...note, picture: { ...note.picture, thumbnail_url: kept } } : note;
}

/**
 * The notes the server lists for this query, or, when it cannot be reached, the copy on the phone (without the notes
 * that are still waiting to upload: the screens show those themselves). Null if there is neither.
 */
async function list(query: NoteQuery): Promise<KnownNote[] | null> {
  try {
    const { data } = await api.GET('/api/notes/', { params: { query: serverQuery(query) } });
    if (data) {
      offline.value = false;
      // What was just read is the newest there is: a note changed here shows changed offline too.
      const mine = data.filter((n) => isKept(n, Number(userId.value)));
      if (mine.length > 0 && loaded.value) dispatch({ type: 'saved', notes: mine });
      return data;
    }
  } catch {
    /* no connection: the copy below */
  }
  if (!loaded.value) return null;
  offline.value = true;
  return selectNotes(state.value, query, new Set(notes.notes.value.map((n) => n.uid))).map(withKeptPicture);
}

effectScope(true).run(() => {
  watch([loaded, status], () => void pull(), { immediate: true });
  // A note that went up is on the server now: learn it.
  watch(notes.uploaded, () => void pull());
  void App.addListener('appStateChange', ({ isActive }) => isActive && void pull());
  log.onAccountDeleted(() => {
    state.value = EMPTY_NOTE_LIBRARY;
    offline.value = false;
  });
});

export function useNoteLibrary() {
  return {
    list,
    pull,
    offline,
    loaded,
    /** A note that was changed on the server, to keep the copy in step. */
    saved: (note: KnownNote) => dispatch({ type: 'saved', notes: [note] }),
    /** A note that was deleted on the server. */
    forget: (uid: string) => dispatch({ type: 'forget', uid }),
  };
}
