// A photo or clip that is still waiting on the phone, as the player shows it. No Vue here, so the rules can be tested.
import type { components } from './api-types.ts';
import type { QueuedMedia } from './media-queue.ts';

type Media = components['schemas']['Media'];

/** The queued item the way the server will describe it, with links to the files on the phone. */
export function clipOfQueued(item: QueuedMedia, me: number, urls: { file: string; thumbnail: string }): Media {
  const owner = item.owner ?? me;
  return {
    id: item.id,
    owner,
    owner_name: '',
    uploaded_by: owner,
    uploaded_by_name: '',
    session: item.session,
    event: item.event?.id ?? '',
    event_info: null,
    kind: item.kind,
    taken_at: item.taken_at,
    width: item.width,
    height: item.height,
    size: 0,
    duration_ms: item.duration_ms ?? null,
    capture_fps: item.capture_fps ?? null,
    frame_count: item.frame_count ?? null,
    note: item.note ?? '',
    created_at: item.taken_at,
    updated_at: item.taken_at,
    file_url: urls.file,
    thumbnail_url: urls.thumbnail,
    can_edit: true,
  };
}

/** A photo or clip the phone kept after it went up: what the server said about it, with links to the files on the phone. */
export function clipOfKept(known: Omit<Media, 'file_url' | 'thumbnail_url'>, urls: { file: string; thumbnail: string }): Media {
  return { ...known, file_url: urls.file, thumbnail_url: urls.thumbnail };
}

/**
 * The photos and clips next to the one on show, in the order of the media screen: what waits on the phone first, then
 * what the server listed. `filter` is what the player was opened with: a session, or an archer.
 */
export function playerSiblings(
  queued: QueuedMedia[],
  listed: { id: string; kind: string }[],
  filter: { session?: string; owner?: number },
  me: number,
): { id: string; kind: string }[] {
  const mine = queued.filter((q) => (filter.session ? q.session === filter.session : (q.owner ?? me) === filter.owner));
  const ids = new Set(mine.map((q) => q.id));
  return [...mine.map((q) => ({ id: q.id, kind: q.kind })), ...listed.filter((m) => !ids.has(m.id))];
}
