import { App } from '@capacitor/app';
import { Network } from '@capacitor/network';
import { computed, effectScope, ref, shallowRef, watch } from 'vue';

import { useAuth } from '@/composables/useAuth';
import { useKeyedStore } from '@/composables/useKeyedStore';
import { useLog } from '@/composables/useLog';
import { useMedia } from '@/composables/useMedia';
import { drainNotes, sendNote } from '@/lib/note-sync';
import { EMPTY_NOTES, type NoteAction, type NotesState, pendingNotes, type QueuedNote, reduce } from '@/lib/note-store';
import { storeKey } from '@/lib/store-owner';
import { newId } from '@/lib/uuid';

// Notes written on this device that have not reached the server yet. They go up with a repeatable `PUT`, after the photo
// or session they are about, and then leave this list: the server's list shows them. Changing or deleting a note the
// server already has still needs a connection.
const RETRY_INTERVAL_MS = 20_000;

const { api, storeOwner, status, isLocal } = useAuth();
const log = useLog();
const media = useMedia();

const storageKey = computed(() => (storeOwner.value ? storeKey('notes', storeOwner.value) : null));
const state = shallowRef<NotesState>(EMPTY_NOTES);
let current: NotesState = EMPTY_NOTES;
let flushing = false;
/** Counts up whenever a note went up, so the screens that show the server's list can fetch it again. */
const uploaded = ref(0);

function dispatch(action: NoteAction) {
  current = reduce(current, action);
  state.value = current;
}

const keyed = effectScope(true).run(() =>
  useKeyedStore<NotesState>({
    key: storageKey,
    empty: EMPTY_NOTES,
    read: () => state.value,
    apply: (value) => dispatch({ type: 'load', state: value }),
    changes: state,
    resetOnKeyChange: true,
  }),
)!;
const { loaded } = keyed;

const notes = computed(() => (loaded.value ? state.value.notes : []));
// Without an account nothing is uploaded, so nothing is waiting: the notes are the list.
const waiting = computed(() => (isLocal.value ? 0 : notes.value.filter((n) => !n.error).length));
const failed = computed(() => (isLocal.value ? [] : notes.value.filter((n) => n.error)));

/** The photo, session or end of the note has not gone up yet. */
function blocked(note: QueuedNote): boolean {
  const photoWaits = note.media !== null && media.items.value.some((i) => i.id === note.media && !i.uploaded);
  return photoWaits || log.parentWaiting(note.session, note.end);
}

async function flush() {
  if (flushing || !loaded.value || status.value !== 'signedIn') return;
  flushing = true;
  try {
    await drainNotes(
      () => current,
      (action) => {
        if (action.type === 'remove') uploaded.value++;
        dispatch(action);
      },
      (note) => sendNote(api, note),
      blocked,
    );
  } finally {
    flushing = false;
  }
}

/** Write a note. It is saved on the device at once and goes up when it can. Returns its uid. */
function add(note: Omit<QueuedNote, 'uid' | 'created_at' | 'error'>): string {
  const uid = newId();
  dispatch({ type: 'add', note: { ...note, uid, created_at: new Date().toISOString() } });
  return uid;
}

const actions = {
  add,
  remove: (uid: string) => dispatch({ type: 'remove', uid }),
  edit: (uid: string, patch: Partial<Pick<QueuedNote, 'body' | 'drawing'>>) => dispatch({ type: 'edit', uid, patch }),
  removeAboutMedia: (media: string) => dispatch({ type: 'removeAboutMedia', media }),
  /** Notes from an exported file (local mode). */
  importNotes: (notes: QueuedNote[]) => dispatch({ type: 'imported', notes }),
  pendingFor: (about: { archer: number; session?: string; media?: string }) => pendingNotes({ notes: notes.value }, about),
  retryFailed: () => {
    dispatch({ type: 'retryFailed' });
    void flush();
  },
  discardFailed: () => dispatch({ type: 'discardFailed' }),
};

// The queue lives as long as the app: its watchers are never stopped.
effectScope(true).run(() => {
  // Also when something the notes wait for has gone up.
  watch([() => state.value.notes, loaded, status, () => log.waiting.value, () => media.waiting.value.length], () => void flush(), { immediate: true });
  let timer: ReturnType<typeof setInterval> | undefined;
  watch(
    waiting,
    (count) => {
      clearInterval(timer);
      timer = count > 0 ? setInterval(() => void flush(), RETRY_INTERVAL_MS) : undefined;
    },
    { immediate: true },
  );
  void App.addListener('appStateChange', ({ isActive }) => isActive && void flush());
  void Network.addListener('networkStatusChange', ({ connected }) => connected && void flush());
  // The account is gone: so are the notes that were still on the way for it.
  log.onAccountDeleted(() => dispatch({ type: 'reset' }));
});

export function useNotes() {
  return { loaded, notes, waiting, failed, uploaded, keyed, ...actions };
}
