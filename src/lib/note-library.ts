// The notes the server has that are yours to keep on the phone: those about you (your own, and the ones shared with you)
// and those you wrote about others as a coach. They are shown without a connection (#84). No Vue here, so the rules can
// be tested. Notes still waiting to upload are not here, they are in the notes queue.
import type { ApiClient } from './auth-session.ts';
import type { components } from './api-types.ts';

export type KnownNote = components['schemas']['Note'];

export type NoteLibraryState = {
  notes: KnownNote[];
  /** Where the last pull got to (the newest change the server sent). */
  lastPull?: string;
};

export const EMPTY_NOTE_LIBRARY: NoteLibraryState = { notes: [] };

export type NoteLibraryAction =
  | { type: 'pulled'; changed: KnownNote[]; gone: string[]; lastPull?: string }
  | { type: 'saved'; notes: KnownNote[] }
  | { type: 'forget'; uid: string }
  | { type: 'clear' };

/** Newest first, like the server's list. */
const newestFirst = (a: KnownNote, b: KnownNote) => b.created_at.localeCompare(a.created_at) || b.id - a.id;

const replace = (state: NoteLibraryState, changed: KnownNote[], gone: string[]) => {
  const uids = new Set([...changed.map((n) => n.uid), ...gone]);
  return [...state.notes.filter((n) => !uids.has(n.uid)), ...changed].sort(newestFirst);
};

export function reduceNoteLibrary(state: NoteLibraryState, action: NoteLibraryAction): NoteLibraryState {
  switch (action.type) {
    case 'pulled':
      return { notes: replace(state, action.changed, action.gone), lastPull: action.lastPull ?? state.lastPull };
    case 'saved': {
      // The screens poll: a list that holds nothing new must not rewrite the file.
      const known = new Map(state.notes.map((n) => [n.uid, n.updated_at]));
      const news = action.notes.filter((n) => known.get(n.uid) !== n.updated_at);
      return news.length === 0 ? state : { ...state, notes: replace(state, news, []) };
    }
    case 'forget':
      return state.notes.some((n) => n.uid === action.uid) ? { ...state, notes: replace(state, [], [action.uid]) } : state;
    case 'clear':
      return EMPTY_NOTE_LIBRARY;
  }
}

/** What the screens ask the server for. `sessionEvent` adds the notes about the event of the session that are in no session. */
export type NoteQuery = {
  archer?: number;
  author?: number;
  session?: string;
  sessionEvent?: string | null;
  event?: string;
  media?: string;
  visibility?: KnownNote['visibility'];
};

/** The query as the server's list takes it. */
export const serverQuery = ({ sessionEvent: _event, ...query }: NoteQuery) => query;

/** Notes the phone may keep: about you, or by you. */
export const isKept = (note: KnownNote, userId: number) => note.archer === userId || note.author === userId;

/** The notes of the copy that match the query, minus those that are waiting in the queue (they show there). They cannot be changed without a connection. */
export function selectNotes(state: NoteLibraryState, query: NoteQuery, queued: ReadonlySet<string> = new Set()): KnownNote[] {
  return state.notes
    .filter((n) => {
      if (queued.has(n.uid)) return false;
      if (query.archer !== undefined && n.archer !== query.archer) return false;
      if (query.author !== undefined && n.author !== query.author) return false;
      if (query.event !== undefined && n.event !== query.event) return false;
      if (query.media !== undefined && n.media !== query.media) return false;
      if (query.visibility !== undefined && n.visibility !== query.visibility) return false;
      if (query.session !== undefined) return n.session === query.session || (!n.session && !!query.sessionEvent && n.event === query.sessionEvent);
      return true;
    })
    .map((n) => ({ ...n, can_edit: false, can_delete: false }));
}

export type NotePull = { changed: KnownNote[]; gone: string[]; lastPull?: string };

/** Notes about you and by you that changed since `since`, and the uids deleted since. Null if the server cannot be reached. */
export async function pullNotes(api: ApiClient, userId: number, since?: string): Promise<NotePull | null> {
  try {
    const query = since ? { updated_after: since } : {};
    const [about, by, gone] = await Promise.all([
      api.GET('/api/notes/', { params: { query: { archer: userId, ...query } } }),
      api.GET('/api/notes/', { params: { query: { author: userId, ...query } } }),
      api.GET('/api/gone/', { params: { query: { kind: 'note', ...query } } }),
    ]);
    if (!about.data || !by.data || !gone.data) return null;
    const changed = [...new Map([...about.data, ...by.data].map((n) => [n.uid, n])).values()];
    const stamps = [...changed.map((n) => n.updated_at), ...gone.data.map((g) => g.at)].sort();
    return { changed, gone: gone.data.map((g) => g.uid), lastPull: stamps.at(-1) };
  } catch {
    return null;
  }
}
