// Local copy of the sessions an archer logs on this device, plus the queue of uploads still to do.
// Pure functions only (no React, no storage), so they can be tested with `npm test`.
import type { EventLink } from './schedule.ts';

/** Empty for a session a coach opened: the archer chooses when adding the first results. */
export type SessionType = '' | 'scoring' | 'volume' | 'technique' | 'competition';
export type Environment = '' | 'indoor' | 'outdoor';

/** Scoring and competition sessions are logged end by end; the others just count arrows. */
export const usesEnds = (type: SessionType) => type === 'scoring' || type === 'competition';

/** The message key of a session type, also for an empty one, so no screen shows a raw key. */
export const sessionTypeKey = (type: string) => `sessionType.${type || 'unset'}`;

/** A plotted shot has x, y and spot (the server works out its score from them); a typed one has only a score. */
export type LogShot = {
  id: string;
  value: number | null;
  is_x: boolean;
  is_miss: boolean;
  x?: number;
  y?: number;
  spot?: number;
  /** Which of the numbered arrows it was, when the archer numbers them. */
  arrow_number?: number;
};
export type LogEnd = { id: string; index: number; distance_m: string; face: string; arrows_per_end: number; shots: LogShot[] };
export type LogVolume = { id: string; distance_m: string; arrow_count: number };
/** The equipment of a session: ids to find the items again, revisions to send, labels to show. */
export type Gear = {
  bow_id: number | null;
  bow_revision: number | null;
  bow_label: string;
  arrow_set_id: number | null;
  arrow_set_revision: number | null;
  arrow_label: string;
  /** The uid of the chosen items and of their revisions: the way to name equipment that was made on the phone and has no integer id yet. */
  bow_key?: string | null;
  arrow_set_key?: string | null;
  bow_revision_uid?: string | null;
  arrow_set_revision_uid?: string | null;
};

/** A copy of your active equipment from the last time the app was online, so a session can start without a connection. */
/** `key` tells the items apart: the uid of the item, or its integer id as text in a copy made before there were uids. The integer ids are missing for items made on the phone that the server has not seen yet. */
export type CachedBow = { key: string; id: number | null; name: string; type: string; revision: number | null; revision_uid?: string; revision_number: number };
export type CachedArrowSet = { key: string; id: number | null; name: string; revision: number | null; revision_uid?: string; revision_number: number; count: number | null };
export type Equipment = { bows: CachedBow[]; arrowSets: CachedArrowSet[] };

/** What the archer notes about a session (weather as written by `encodeWeather`, ratings 1 to 5). */
export type SessionDetails = { weather: string; physical_rating: number | null; mental_rating: number | null; goals: string; notes: string };

export type LogSession = {
  id: string;
  started_at: string;
  ended_at: string | null;
  type: SessionType;
  environment: Environment;
  location: string;
  ends: LogEnd[];
  volume: LogVolume[];
  /** Left out when no choice was made, so uploading it does not clear what the server has. */
  gear?: Gear | null;
  /** Left out until the archer fills it in, so uploading the session does not clear anything on the server. */
  details?: SessionDetails;
  /** The team training this session was part of. Left out when no choice was made (the server keeps its value); `null` after "None". */
  event?: EventLink | null;
  /** Who sees it. Left out until the archer chooses, so the server applies their default; a pull takes the server's value. */
  visibility?: Visibility;
  /** A coach logging for an archer without an account: who (the id of their profile on the server, and the name for display). */
  owner?: number;
  owner_name?: string;
  /** Who opened it, when that is not the archer (a coach). */
  opened_by?: number;
  opened_by_name?: string;
  /** Opened without results (by a coach, or pulled from the server): never removed just because it is still empty. */
  keep?: boolean;
  /** This device only attaches media and notes: the results are the archer's, who has an account. */
  noResults?: boolean;
  /** The server deleted it while results of it were still waiting to upload. Kept until the archer chooses (`keepGoneAsNew` or `discardGone`). */
  gone?: boolean;
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

/** The levels the server accepts for training now (`me` < `coaches`, see specs/design/session-visibility.md). */
export type Visibility = 'me' | 'coaches';
export const isVisibility = (v: unknown): v is Visibility => v === 'me' || v === 'coaches';

export type LogState = { sessions: LogSession[]; outbox: Op[]; nextRev: number; equipment: Equipment; lastPull?: string };
export const EMPTY_LOG: LogState = { sessions: [], outbox: [], nextRev: 1, equipment: { bows: [], arrowSets: [] } };

export type LogAction =
  | { type: 'load'; state: LogState }
  | { type: 'startSession'; session: LogSession }
  | { type: 'updateSession'; id: string; patch: Partial<Pick<LogSession, 'ended_at' | 'location' | 'environment' | 'gear' | 'details' | 'type' | 'event' | 'visibility'>> }
  /** Sessions the server has and this device does not (nothing to upload), and where the pull got to. */
  | { type: 'pulled'; sessions: LogSession[]; lastPull?: string }
  /** The server merged `from` into `to`: this device follows. */
  | { type: 'replaceSessionId'; from: string; to: string }
  /** The server deleted the session. One with results still waiting to upload is kept and marked `gone`; any other is dropped. */
  | { type: 'sessionGone'; id: string }
  /** Upload a `gone` session again as a new session (`newId`), with all its results. */
  | { type: 'keepGoneAsNew'; id: string; newId: string }
  /** Drop a `gone` session and its results. */
  | { type: 'discardGone'; id: string }
  | { type: 'setEquipment'; equipment: Equipment }
  | { type: 'reset' }
  /** Sessions from an exported file (local mode): those the device does not have are added, the others are left as they are. */
  | { type: 'imported'; sessions: LogSession[] }
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

const hasResults = (s: LogSession) => s.ends.length > 0 || s.volume.length > 0;

/**
 * The list of `local` items after a pull: the server's items, except where this device has an op waiting for the item (the
 * local copy goes up next and wins), plus local items that wait to be uploaded. An item the server does not have and
 * nothing waits for is dropped (it was deleted elsewhere); an item whose delete is queued does not come back.
 */
function mergeItems<T extends { id: string }>(local: T[], server: T[], waiting: (id: string, del: boolean) => boolean, order: (a: T, b: T) => number): T[] {
  const mine = new Map(local.map((x) => [x.id, x]));
  const out: T[] = [];
  for (const theirs of server) {
    if (waiting(theirs.id, true)) continue;
    out.push(waiting(theirs.id, false) ? (mine.get(theirs.id) ?? theirs) : theirs);
  }
  for (const x of local) if (!server.some((t) => t.id === x.id) && waiting(x.id, false)) out.push(x);
  return out.sort(order);
}

/** A session the server sent, put into the log: added if new, else its metadata, ends and volume merged by `mergeItems`. */
function mergePulled(state: LogState, theirs: LogSession): LogState {
  const mine = state.sessions.find((s) => s.id === theirs.id);
  if (!mine) return { ...state, sessions: [...state.sessions, theirs] };
  if (mine.gone) return state;
  const waiting = (kind: Op['kind']) => (id: string, del: boolean) =>
    state.outbox.some((o) => o.kind === kind && o.sessionId === mine.id && o.itemId === id && !!o.delete === del);
  const metaWaits = state.outbox.some((o) => o.kind === 'session' && o.sessionId === mine.id);
  const meta = metaWaits
    ? {}
    : {
        started_at: theirs.started_at, ended_at: theirs.ended_at, type: theirs.type, environment: theirs.environment, location: theirs.location,
        details: theirs.details, opened_by: theirs.opened_by, opened_by_name: theirs.opened_by_name,
        ...(theirs.visibility ? { visibility: theirs.visibility } : {}),
        ...(theirs.event ? { event: theirs.event } : {}),
      };
  const next: LogSession = {
    ...mine,
    ...meta,
    gear: mine.gear ?? theirs.gear,
    ends: mergeItems(mine.ends, theirs.ends, waiting('end'), (a, b) => a.index - b.index),
    volume: mergeItems(mine.volume, theirs.volume, waiting('volume'), () => 0),
  };
  return { ...state, sessions: state.sessions.map((s) => (s.id === mine.id ? next : s)) };
}

/** One op per key: when two collide, the newer one stays where the first was. */
function dedupe(outbox: Op[]): Op[] {
  const newest = new Map<string, Op>();
  for (const o of outbox) if (!newest.has(o.key) || newest.get(o.key)!.rev < o.rev) newest.set(o.key, o);
  return [...new Map(outbox.map((o) => [o.key, newest.get(o.key)!])).values()];
}

function replaceSessionId(state: LogState, from: string, to: string): LogState {
  if (from === to) return state;
  const src = state.sessions.find((s) => s.id === from);
  const dst = state.sessions.find((s) => s.id === to);
  // What was queued for the old id goes to the new one. A delete of the old id must not reach the winner.
  const moved = state.outbox
    .filter((o) => !(o.sessionId === from && o.kind === 'session' && o.delete))
    .map((o) => (o.sessionId === from ? { ...o, sessionId: to, key: opKey(o.kind, to, o.itemId) } : o));
  if (!src) return { ...state, outbox: dedupe(moved) };
  if (!dst && src.noResults) {
    // A coach's copy of a session that now belongs to the archer's: the server view takes over.
    return { ...state, sessions: state.sessions.filter((s) => s.id !== from), outbox: dedupe(moved.filter((o) => o.sessionId !== to)) };
  }
  if (!dst) return { ...state, sessions: state.sessions.map((s) => (s.id === from ? { ...s, id: to } : s)), outbox: dedupe(moved) };
  // Both are here: the results of the old one go into the new one, after its own ends.
  const next = (dst.ends.length ? Math.max(...dst.ends.map((e) => e.index)) + 1 : 0);
  const renumbered = [...src.ends].sort((a, b) => a.index - b.index).map((e, i) => ({ ...e, index: next + i }));
  const merged: LogSession = {
    ...dst,
    ends: [...dst.ends, ...renumbered],
    volume: [...dst.volume, ...src.volume],
    ended_at: dst.ended_at ?? src.ended_at,
    location: dst.location || src.location,
    environment: dst.environment || src.environment,
    type: dst.type || src.type,
    gear: dst.gear ?? src.gear,
    details: dst.details ?? src.details,
    event: dst.event ?? src.event,
  };
  const sessions = state.sessions.filter((s) => s.id !== from).map((s) => (s.id === to ? merged : s));
  let result: LogState = { ...state, sessions, outbox: dedupe(moved) };
  for (const e of renumbered) result = queue(result, 'end', to, e.id); // the new numbering goes up
  return queue(result, 'session', to);
}

export function reduce(state: LogState, action: LogAction): LogState {
  switch (action.type) {
    case 'load':
      // Older saved logs have no equipment yet.
      return { ...EMPTY_LOG, ...action.state };
    case 'reset':
      // Everything on this device: sessions, the upload queue and the stored equipment.
      return EMPTY_LOG;
    case 'imported': {
      const known = new Set(state.sessions.map((s) => s.id));
      let next = state;
      for (const session of action.sessions.filter((s) => !known.has(s.id))) {
        next = { ...next, sessions: [...next.sessions, session].sort((a, b) => b.started_at.localeCompare(a.started_at)) };
        next = queue(next, 'session', session.id);
        for (const e of session.ends) next = queue(next, 'end', session.id, e.id);
        for (const v of session.volume) next = queue(next, 'volume', session.id, v.id);
      }
      return next;
    }
    case 'setEquipment':
      return { ...state, equipment: action.equipment };
    case 'startSession':
      return queue({ ...state, sessions: [action.session, ...state.sessions] }, 'session', action.session.id);
    case 'updateSession': {
      const { type, ...patch } = action.patch;
      // The type decides how results are entered, so it can only be set while there are none.
      const settable = type !== undefined && !state.sessions.some((s) => s.id === action.id && (s.ends.length > 0 || s.volume.length > 0));
      return queue(mapSession(state, action.id, (s) => ({ ...s, ...patch, ...(settable ? { type } : {}) })), 'session', action.id);
    }
    case 'pulled': {
      const deleted = new Set(state.outbox.filter((o) => o.kind === 'session' && o.delete).map((o) => o.sessionId));
      const next = action.sessions.filter((s) => !deleted.has(s.id)).reduce(mergePulled, state);
      return { ...next, lastPull: action.lastPull ?? state.lastPull };
    }
    case 'sessionGone': {
      const unsent = state.outbox.some((o) => o.sessionId === action.id && !o.delete && (o.kind === 'end' || o.kind === 'volume'));
      const outbox = state.outbox.filter((o) => o.sessionId !== action.id);
      if (unsent && state.sessions.some((s) => s.id === action.id)) return mapSession({ ...state, outbox }, action.id, (s) => ({ ...s, gone: true }));
      return { ...state, sessions: state.sessions.filter((s) => s.id !== action.id), outbox };
    }
    case 'keepGoneAsNew': {
      const src = state.sessions.find((s) => s.id === action.id && s.gone);
      if (!src) return state;
      const { gone: _gone, ...rest } = src;
      let next: LogState = { ...state, sessions: state.sessions.map((s) => (s.id === action.id ? { ...rest, id: action.newId } : s)) };
      next = queue(next, 'session', action.newId);
      for (const e of src.ends) next = queue(next, 'end', action.newId, e.id);
      for (const v of src.volume) next = queue(next, 'volume', action.newId, v.id);
      return next;
    }
    case 'discardGone':
      return { ...state, sessions: state.sessions.filter((s) => !(s.id === action.id && s.gone)), outbox: state.outbox.filter((o) => o.sessionId !== action.id) };
    case 'replaceSessionId':
      return replaceSessionId(state, action.from, action.to);
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

/** The settings of a first end, before anything was shot. */
export function firstEndDefaults(environment: Environment) {
  return {
    distance_m: environment === 'outdoor' ? '70' : '18',
    face: environment === 'outdoor' ? 'wa-122' : 'wa-40',
    arrows_per_end: 3,
  };
}

/** Where the next end starts from: same distance, face and arrow count as the last one. */
export function nextEndDefaults(session: LogSession) {
  const last = session.ends[session.ends.length - 1];
  const first = firstEndDefaults(session.environment);
  return {
    index: last ? last.index + 1 : 0,
    distance_m: last?.distance_m ?? first.distance_m,
    face: last?.face ?? first.face,
    arrows_per_end: last?.arrows_per_end ?? first.arrows_per_end,
  };
}

// --- equipment ----------------------------------------------------------------------------------

/** The gear for a choice of bow and arrow set (their keys), using their current revisions from the stored equipment. */
export function gearFor(equipment: Equipment, bowKey: string | null, arrowSetKey: string | null): Gear {
  const bow = equipment.bows.find((b) => b.key === bowKey);
  const arrows = equipment.arrowSets.find((a) => a.key === arrowSetKey);
  return {
    bow_id: bow?.id ?? null,
    bow_revision: bow?.revision ?? null,
    bow_label: bow ? `${bow.name} (r${bow.revision_number})` : '',
    bow_key: bow?.key ?? null,
    bow_revision_uid: bow?.revision_uid ?? null,
    // Arrows go with a bow: a server cannot make a setup of arrows alone.
    arrow_set_id: bow ? (arrows?.id ?? null) : null,
    arrow_set_revision: bow ? (arrows?.revision ?? null) : null,
    arrow_label: bow && arrows ? `${arrows.name} (r${arrows.revision_number})` : '',
    arrow_set_key: bow ? (arrows?.key ?? null) : null,
    arrow_set_revision_uid: bow ? (arrows?.revision_uid ?? null) : null,
  };
}

/** Which items of the stored equipment a session's gear is about: by key, or by integer id for gear saved before there were keys. */
export function chosenKeys(equipment: Equipment, gear: Gear | null | undefined): { bowKey: string | null; arrowSetKey: string | null } {
  const bow = equipment.bows.find((b) => (gear?.bow_key != null && b.key === gear.bow_key) || (gear?.bow_id != null && b.id === gear.bow_id));
  const arrows = equipment.arrowSets.find(
    (a) => (gear?.arrow_set_key != null && a.key === gear.arrow_set_key) || (gear?.arrow_set_id != null && a.id === gear.arrow_set_id),
  );
  return { bowKey: bow?.key ?? null, arrowSetKey: arrows?.key ?? null };
}

/** What to preselect when starting a session: what was used last, else the only one there is. */
export function defaultChoice(equipment: Equipment, sessions: LogSession[]): { bowKey: string | null; arrowSetKey: string | null } {
  const last = chosenKeys(equipment, sessions.find((s) => s.gear?.bow_id != null || s.gear?.bow_key != null)?.gear);
  return {
    bowKey: last.bowKey ?? (equipment.bows.length === 1 ? equipment.bows[0].key : null),
    arrowSetKey: last.arrowSetKey ?? (equipment.arrowSets.length === 1 ? equipment.arrowSets[0].key : null),
  };
}

export const gearLine = (gear: Gear | null | undefined) => [gear?.bow_label, gear?.arrow_label].filter(Boolean).join(' · ');
