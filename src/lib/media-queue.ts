// Photos and videos wait on the phone until they are uploaded, like the training log. This is the sending side,
// without Vue, so the retry rules can be tested with `npm test`. Photos and videos take the same way; only the file differs.
import type { ApiClient } from './auth-session.ts';
import { errorMessage } from './errors.ts';
import type { SendResult } from './log-sync.ts';

export type MediaKind = 'photo' | 'video';

/** A photo or video that has not reached the server yet. The files are stored beside it (media-files.ts). */
export type QueuedMedia = {
  id: string;
  kind: MediaKind;
  /** The archer it is about; null for yourself. */
  owner: number | null;
  session: string | null;
  taken_at: string;
  width: number;
  height: number;
  duration_ms?: number;
  capture_fps?: number;
  frame_count?: number;
  note?: string;
  /** Set when the server refused it. */
  error?: string;
};

export type MediaFiles = { file: Blob; thumbnail: Blob };

/** The queued items that belong to session `from` belong to `to` now (the server merged the sessions). */
export function renameSession(items: QueuedMedia[], from: string, to: string): QueuedMedia[] {
  return items.some((i) => i.session === from) ? items.map((i) => (i.session === from ? { ...i, session: to } : i)) : items;
}

export type MediaSendResult = SendResult | { kind: 'withoutSession' };

export function mediaForm(item: QueuedMedia, files: MediaFiles, withSession: boolean): FormData {
  const form = new FormData();
  form.append('kind', item.kind);
  form.append('taken_at', item.taken_at);
  form.append('width', String(item.width));
  form.append('height', String(item.height));
  for (const key of ['duration_ms', 'capture_fps', 'frame_count', 'note'] as const) {
    if (item[key] !== undefined) form.append(key, String(item[key]));
  }
  if (withSession && item.session) form.append('session', item.session);
  form.append('file', files.file, `${item.id}.${item.kind === 'video' ? 'mp4' : 'jpg'}`);
  form.append('thumbnail', files.thumbnail, `${item.id}-thumb.jpg`);
  return form;
}

/** Upload one item. Repeating it is safe: the server knows the id. */
export async function sendMedia(api: ApiClient, item: QueuedMedia, files: MediaFiles): Promise<MediaSendResult> {
  try {
    const { response, error } = await api.PUT('/api/media/{media_id}/', {
      params: { path: { media_id: item.id }, query: item.owner ? { owner: item.owner } : undefined },
      body: {},
      bodySerializer: () => mediaForm(item, files, true),
    });
    if (response.ok) return { kind: 'ok' };
    if (response.status === 401 || response.status >= 500) return { kind: 'retry' };
    // The session is gone (or never reached the server): the clip is worth keeping without it.
    if (response.status === 400 && item.session && (error as { session?: unknown } | undefined)?.session) return { kind: 'withoutSession' };
    return { kind: 'failed', message: `${response.status}: ${errorMessage(error)}` };
  } catch {
    return { kind: 'retry' }; // no connection
  }
}

export type MediaDrain = {
  items: () => QueuedMedia[];
  done: (id: string) => void;
  fail: (id: string, message: string) => void;
  dropSession: (id: string) => void;
  send: (item: QueuedMedia) => Promise<MediaSendResult>;
  /** An item that has to wait, because its session is still on its way. */
  blocked?: (item: QueuedMedia) => boolean;
  stop?: () => boolean;
};

/**
 * Send the queue one by one, oldest first. What the server takes leaves the queue; what it refuses is marked and
 * skipped; no connection (or a server error) ends the run. An item whose session is not uploaded yet is passed over.
 */
export async function drainMedia({ items, done, fail, dropSession, send, blocked = () => false, stop = () => false }: MediaDrain): Promise<void> {
  const passed = new Set<string>();
  for (;;) {
    if (stop()) return;
    const item = items().find((i) => !i.error && !passed.has(i.id));
    if (!item) return;
    if (blocked(item)) {
      passed.add(item.id);
      continue;
    }
    const result = await send(item);
    if (result.kind === 'ok') done(item.id);
    else if (result.kind === 'failed') fail(item.id, result.message);
    else if (result.kind === 'withoutSession') dropSession(item.id);
    else return;
  }
}
