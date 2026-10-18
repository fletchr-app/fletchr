// Local copy of the sessions an archer logs on this device, plus the queue of uploads still to do.
// Pure functions only (no React, no storage), so they can be tested with `npm test`.

export type SessionType = 'scoring' | 'volume' | 'technique' | 'competition';
export type Environment = '' | 'indoor' | 'outdoor';

/** Scoring and competition sessions are logged end by end; the others just count arrows. */
export const usesEnds = (type: SessionType) => type === 'scoring' || type === 'competition';

/** A plotted shot has x, y and spot (the server works out its score from them); a typed one has only a score. */
export type LogShot = {
  id: string;
  value: number | null;
  is_x: boolean;
  is_miss: boolean;
  x?: number;
  y?: number;
  spot?: number;
};
export type LogEnd = { id: string; index: number; distance_m: string; face: string; arrows_per_end: number; shots: LogShot[] };
export type LogVolume = { id: string; distance_m: string; arrow_count: number };
export type LogSession = {
  id: string;
  started_at: string;
  ended_at: string | null;
  type: SessionType;
  environment: Environment;
  location: string;
  ends: LogEnd[];
  volume: LogVolume[];
};

/**
 * One upload still to do. The body of a PUT is read from the current local data when it is sent, so
 * edits made while waiting are included, and one op per item is enough. `rev` tells a finished
 * upload apart from an edit made while it was running.
 */
export type Op = {
  key: string;
  kind: 'session' | 'end' | 'volume';
  sessionId: string;
  itemId?: string;
  delete?: boolean;
  rev: number;
  error?: string;
};

export type LogState = { sessions: LogSession[]; outbox: Op[]; nextRev: number };
export const EMPTY_LOG: LogState = { sessions: [], outbox: [], nextRev: 1 };

export type LogAction =
  | { type: 'load'; state: LogState }
  | { type: 'startSession'; session: LogSession }
  | { type: 'updateSession'; id: string; patch: Partial<Pick<LogSession, 'ended_at' | 'location' | 'environment'>> }
  | { type: 'saveEnd'; sessionId: string; end: LogEnd }
  | { type: 'deleteEnd'; sessionId: string; endId: string }
  | { type: 'saveVolume'; sessionId: string; entry: LogVolume }
  | { type: 'deleteVolume'; sessionId: string; entryId: string }
  | { type: 'deleteSession'; id: string }
  | { type: 'opDone'; key: string; rev: number }
  | { type: 'opFailed'; key: string; rev: number; error: string }
  | { type: 'retryFailed' }
  | { type: 'discardFailed' };

const opKey = (kind: Op['kind'], sessionId: string, itemId?: string) => `${kind}:${sessionId}:${itemId ?? ''}`;

/** Replaces the op for the same item in place (so a session still goes up before its ends), else appends. */
function queue(state: LogState, kind: Op['kind'], sessionId: string, itemId?: string, del = false): LogState {
  const key = opKey(kind, sessionId, itemId);
  const op: Op = { key, kind, sessionId, itemId, delete: del || undefined, rev: state.nextRev };
  const at = state.outbox.findIndex((o) => o.key === key);
  const outbox = at === -1 ? [...state.outbox, op] : state.outbox.map((o, i) => (i === at ? op : o));
  return { ...state, outbox, nextRev: state.nextRev + 1 };
}

const mapSession = (state: LogState, id: string, fn: (s: LogSession) => LogSession): LogState => ({
  ...state,
  sessions: state.sessions.map((s) => (s.id === id ? fn(s) : s)),
});

export function reduce(state: LogState, action: LogAction): LogState {
  switch (action.type) {
    case 'load':
      return action.state;
    case 'startSession':
      return queue({ ...state, sessions: [action.session, ...state.sessions] }, 'session', action.session.id);
    case 'updateSession':
      return queue(mapSession(state, action.id, (s) => ({ ...s, ...action.patch })), 'session', action.id);
    case 'saveEnd': {
      const { sessionId, end } = action;
      const next = mapSession(state, sessionId, (s) => ({
        ...s,
        ends: [...s.ends.filter((e) => e.id !== end.id), end].sort((a, b) => a.index - b.index),
      }));
      return queue(next, 'end', sessionId, end.id);
    }
    case 'deleteEnd':
      return queue(
        mapSession(state, action.sessionId, (s) => ({ ...s, ends: s.ends.filter((e) => e.id !== action.endId) })),
        'end',
        action.sessionId,
        action.endId,
        true,
      );
    case 'saveVolume': {
      const { sessionId, entry } = action;
      const next = mapSession(state, sessionId, (s) => ({
        ...s,
        volume: [...s.volume.filter((v) => v.id !== entry.id), entry],
      }));
      return queue(next, 'volume', sessionId, entry.id);
    }
    case 'deleteVolume':
      return queue(
        mapSession(state, action.sessionId, (s) => ({ ...s, volume: s.volume.filter((v) => v.id !== action.entryId) })),
        'volume',
        action.sessionId,
        action.entryId,
        true,
      );
    case 'deleteSession': {
      // The server deletes everything under a session, so one op replaces all the pending ones.
      const rest = { ...state, sessions: state.sessions.filter((s) => s.id !== action.id), outbox: state.outbox.filter((o) => o.sessionId !== action.id) };
      return queue(rest, 'session', action.id, undefined, true);
    }
    case 'opDone':
      // An edit made during the upload has a newer rev and stays queued.
      return { ...state, outbox: state.outbox.filter((o) => !(o.key === action.key && o.rev === action.rev)) };
    case 'opFailed':
      return { ...state, outbox: state.outbox.map((o) => (o.key === action.key && o.rev === action.rev ? { ...o, error: action.error } : o)) };
    case 'retryFailed':
      return { ...state, outbox: state.outbox.map(({ error: _error, ...o }) => o) };
    case 'discardFailed':
      return { ...state, outbox: state.outbox.filter((o) => !o.error) };
  }
}

// --- scores -------------------------------------------------------------------------------------

export const shotPoints = (shot: LogShot) => (shot.is_miss ? 0 : (shot.value ?? 0));
export const shotLabel = (shot: LogShot) => (shot.is_miss ? 'M' : shot.is_x ? 'X' : String(shot.value ?? '–'));
/** Best arrow first: X, 10, 9 ... and misses last. */
export function sortedShots(shots: LogShot[]): LogShot[] {
  const rank = (s: LogShot) => (s.is_miss ? -1 : (s.value ?? 0) * 2 + (s.is_x ? 1 : 0));
  return [...shots].sort((a, b) => rank(b) - rank(a));
}
export const endTotal = (end: LogEnd) => end.shots.reduce((sum, s) => sum + shotPoints(s), 0);

export function sessionTotals(session: LogSession) {
  return {
    arrows: session.ends.reduce((n, e) => n + e.shots.length, 0) + session.volume.reduce((n, v) => n + v.arrow_count, 0),
    score: session.ends.reduce((sum, e) => sum + endTotal(e), 0),
  };
}

export type KeypadKey = { label: string; value: number | null; is_x: boolean; is_miss: boolean };
type KeypadFace = { kind: string; rings: { value: number }[]; x_diameter_cm?: number };

/** The buttons for typing in scores on a face, best first. Rings in the catalogue run inner to outer. */
export function keypadFor(face: KeypadFace): KeypadKey[] {
  if (face.rings.length === 0) return [];
  const keys: KeypadKey[] = [];
  if (face.x_diameter_cm) keys.push({ label: 'X', value: 10, is_x: true, is_miss: false });
  for (const ring of face.rings) {
    keys.push({ label: String(ring.value), value: ring.value, is_x: false, is_miss: false });
  }
  keys.push({ label: 'M', value: null, is_x: false, is_miss: true });
  return keys;
}

/** Where the next end starts from: same distance, face and arrow count as the last one. */
export function nextEndDefaults(session: LogSession) {
  const last = session.ends[session.ends.length - 1];
  return {
    index: last ? last.index + 1 : 0,
    distance_m: last?.distance_m ?? (session.environment === 'outdoor' ? '70' : '18'),
    face: last?.face ?? (session.environment === 'outdoor' ? 'wa-122' : 'wa-40'),
    arrows_per_end: last?.arrows_per_end ?? 3,
  };
}
