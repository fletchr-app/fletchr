// What the phone knows about the photos and videos the server has of you, to show them without a connection (#84).
// Only the list and the thumbnails are kept; the files stream from the server. No Vue here, so the rules can be tested.
import type { ApiClient } from './auth-session.ts';
import type { components } from './api-types.ts';

type Media = components['schemas']['Media'];

/** A photo or video as the server described it, without the links (they run out after an hour). */
export type KnownMedia = Omit<Media, 'file_url' | 'thumbnail_url'>;

export type LibraryState = {
  items: KnownMedia[];
  /** Ids whose thumbnail is on the phone. */
  cached: string[];
  /** Where the last pull got to (the newest change the server sent). */
  lastPull?: string;
};

export const EMPTY_LIBRARY: LibraryState = { items: [], cached: [] };

export type LibraryAction =
  | { type: 'pulled'; changed: KnownMedia[]; gone: string[]; lastPull?: string }
  | { type: 'thumbnailSaved'; id: string }
  | { type: 'clear' };

const newestFirst = (a: KnownMedia, b: KnownMedia) => b.taken_at.localeCompare(a.taken_at) || b.created_at.localeCompare(a.created_at);

export function reduceLibrary(state: LibraryState, action: LibraryAction): LibraryState {
  switch (action.type) {
    case 'pulled': {
      const ids = new Set([...action.changed.map((m) => m.id), ...action.gone]);
      const items = [...state.items.filter((m) => !ids.has(m.id)), ...action.changed].sort(newestFirst);
      const gone = new Set(action.gone);
      return { items, cached: state.cached.filter((id) => !gone.has(id)), lastPull: action.lastPull ?? state.lastPull };
    }
    case 'thumbnailSaved':
      return state.cached.includes(action.id) || !state.items.some((m) => m.id === action.id) ? state : { ...state, cached: [...state.cached, action.id] };
    case 'clear':
      return EMPTY_LIBRARY;
  }
}

/** The items with no thumbnail on the phone yet, newest first. */
export const missingThumbnails = (state: LibraryState): KnownMedia[] => state.items.filter((m) => !state.cached.includes(m.id));

export const withoutLinks = ({ file_url: _file, thumbnail_url: _thumbnail, ...rest }: Media): KnownMedia => rest;

export type MediaPull = { changed: Media[]; gone: string[]; lastPull?: string };

/**
 * Your photos and videos that changed since `since`, and the ids deleted since. Null if the server cannot be reached.
 * `changed` still has the thumbnail links, for the download that follows.
 */
export async function pullMedia(api: ApiClient, userId: number, since?: string): Promise<MediaPull | null> {
  try {
    const query = since ? { updated_after: since } : {};
    const [list, gone] = await Promise.all([
      api.GET('/api/media/', { params: { query: { owner: userId, ...query } } }),
      api.GET('/api/gone/', { params: { query: { kind: 'media', ...query } } }),
    ]);
    if (!list.data || !gone.data) return null;
    const stamps = [...list.data.map((m) => m.updated_at), ...gone.data.map((g) => g.at)].sort();
    return { changed: list.data, gone: gone.data.map((g) => g.uid), lastPull: stamps.at(-1) };
  } catch {
    return null;
  }
}
