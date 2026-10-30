// Notes written on this device that have not reached the server yet. Pure functions only (no Vue, no storage), so they
// can be tested with `npm test`. A note gets an id (`uid`) when it is written, so it can be uploaded with a repeatable
// `PUT`, after the photo or session it is about. Once the server has it, it leaves this queue and the server's list
// shows it. Notes the server already has are still changed and deleted online.
import type { Drawing } from './drawing.ts';

export type NoteVisibility = 'private' | 'coach_only' | 'shared';

export type QueuedNote = {
  uid: string;
  archer: number;
  /** Empty for a note about yourself. */
  team: number | null;
  body: string;
  visibility: NoteVisibility;
  session: string | null;
  end: string | null;
  media: string | null;
  frame: number | null;
  time_ms: number | null;
  drawing: Drawing | null;
  created_at: string;
  /** Set when the server refused it. */
  error?: string;
};

export type NotesState = { notes: QueuedNote[] };
export const EMPTY_NOTES: NotesState = { notes: [] };

export type NoteAction =
  | { type: 'load'; state: NotesState }
  | { type: 'reset' }
  | { type: 'add'; note: QueuedNote }
  | { type: 'remove'; uid: string }
  | { type: 'failed'; uid: string; error: string }
  | { type: 'retryFailed' }
  | { type: 'discardFailed' };

export function reduce(state: NotesState, action: NoteAction): NotesState {
  switch (action.type) {
    case 'load':
      return { ...EMPTY_NOTES, ...action.state };
    case 'reset':
      return EMPTY_NOTES;
    case 'add':
      return state.notes.some((n) => n.uid === action.note.uid) ? state : { notes: [...state.notes, action.note] };
    case 'remove':
      return { notes: state.notes.filter((n) => n.uid !== action.uid) };
    case 'failed':
      return { notes: state.notes.map((n) => (n.uid === action.uid ? { ...n, error: action.error } : n)) };
    case 'retryFailed':
      return { notes: state.notes.map(({ error: _error, ...n }) => n) };
    case 'discardFailed':
      return { notes: state.notes.filter((n) => !n.error) };
  }
}

/** The queued notes about this archer, narrowed to a session or a photo or clip when given. Oldest first. */
export function pendingNotes(state: NotesState, about: { archer: number; session?: string; media?: string }): QueuedNote[] {
  return state.notes.filter(
    (n) => n.archer === about.archer && (about.session === undefined || n.session === about.session) && (about.media === undefined || n.media === about.media),
  );
}
