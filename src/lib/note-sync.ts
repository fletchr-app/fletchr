// Uploading queued notes. No Vue here, so the rules can be tested with `npm test`.
import type { ApiClient } from './auth-session.ts';
import type { components } from './api-types.ts';
import { errorMessage } from './errors.ts';
import type { NoteAction, NotesState, QueuedNote } from './note-store.ts';

export type SendResult = { kind: 'ok' } | { kind: 'retry' } | { kind: 'failed'; message: string };

type Body = components['schemas']['NoteRequest'];

/** Upload one note with `PUT` by its uid, which is safe to repeat. */
export async function sendNote(api: ApiClient, note: QueuedNote): Promise<SendResult> {
  const body: Body = {
    archer: note.archer,
    team: note.team,
    body: note.body,
    visibility: note.visibility,
    session: note.session,
    end: note.end,
    media: note.media,
    frame: note.frame,
    time_ms: note.time_ms,
    drawing: note.drawing,
  };
  try {
    const { response, data, error } = await api.PUT('/api/notes/{uid}/', { params: { path: { uid: note.uid } }, body });
    if (data) return { kind: 'ok' };
    // No login or a server error is tried again later; a note the server refuses is the note's fault.
    if (response.status === 401 || response.status >= 500) return { kind: 'retry' };
    return { kind: 'failed', message: errorMessage(error) };
  } catch {
    return { kind: 'retry' }; // no connection
  }
}

/**
 * Send queued notes one by one, oldest first. A note whose photo, session or end is still waiting to go up is passed over
 * for now (`blocked`); one the server accepts leaves the queue; one it refuses is marked failed; no connection (or a
 * server error) ends the run and leaves everything for the next attempt.
 */
export async function drainNotes(
  get: () => NotesState,
  dispatch: (action: NoteAction) => void,
  sendOne: (note: QueuedNote) => Promise<SendResult>,
  blocked: (note: QueuedNote) => boolean = () => false,
  stop: () => boolean = () => false,
): Promise<void> {
  for (;;) {
    if (stop()) return;
    const note = get().notes.find((n) => !n.error && !blocked(n));
    if (!note) return;
    const result = await sendOne(note);
    if (result.kind === 'ok') dispatch({ type: 'remove', uid: note.uid });
    else if (result.kind === 'failed') dispatch({ type: 'failed', uid: note.uid, error: result.message });
    else return;
  }
}
