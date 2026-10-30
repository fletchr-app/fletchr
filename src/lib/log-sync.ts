// Uploading the queue of a local log. No React here, so the retry rules can be tested with `npm test`.
import type { ApiClient } from './auth-session.ts';
import { errorMessage } from './errors.ts';
import type { Gear, LogAction, LogSession, LogState, Op } from './log-model.ts';
import { fromServer } from './session-view.ts';

/** `mergedInto`: the server put this session into another one, which has this id. `gone`: the server deleted it. */
export type SendResult = { kind: 'ok'; mergedInto?: string } | { kind: 'retry' } | { kind: 'gone' } | { kind: 'failed'; message: string };

/** Names the equipment by the uids of its revisions when the copy has them (equipment made on the phone has no integer id), else by integer id as before. */
function gearBody(gear: Gear) {
  if (gear.bow_revision_uid || gear.arrow_set_revision_uid) {
    return { bow_revision_uid: gear.bow_revision_uid ?? null, arrow_set_revision_uid: gear.arrow_set_revision_uid ?? null };
  }
  return { bow_revision: gear.bow_revision, arrow_set_revision: gear.arrow_set_revision };
}

/** A session that names equipment the server has not seen yet waits: equipment goes up before the sessions that use it. */
export function waitsForEquipment(state: LogState, op: Op, revisionPending: (uid: string) => boolean): boolean {
  if (op.kind !== 'session' || op.delete) return false;
  const gear = state.sessions.find((s) => s.id === op.sessionId)?.gear;
  return [gear?.bow_revision_uid, gear?.arrow_set_revision_uid].some((uid) => !!uid && revisionPending(uid));
}

/** Upload one queued item, with its body taken from the current local data. */
export async function send(api: ApiClient, state: LogState, op: Op): Promise<SendResult> {
  const session = state.sessions.find((s) => s.id === op.sessionId);
  try {
    let result: { response: Response; data?: { id?: string }; error?: unknown };
    if (op.kind === 'session' && op.delete) {
      result = await api.DELETE('/api/sessions/{session_id}/', { params: { path: { session_id: op.sessionId } } });
    } else if (op.kind === 'session') {
      if (!session) return { kind: 'ok' };
      result = await api.PUT('/api/sessions/{session_id}/', {
        // `owner` only matters when the session is created: a coach logging for an archer without an account.
        params: { path: { session_id: op.sessionId }, query: session.owner ? { owner: session.owner } : undefined },
        body: {
          started_at: session.started_at,
          ended_at: session.ended_at,
          type: session.type,
          environment: session.environment,
          location: session.location,
          ...(session.details ?? {}),
          // Left out when nothing was chosen; null takes the link out. An occurrence that is no row yet is made by the server.
          ...(session.event
            ? { event: session.event.id, ...(session.event.slot && session.event.date ? { event_slot: session.event.slot, event_date: session.event.date } : {}) }
            : session.event === null
              ? { event: null }
              : {}),
          // Left out when nothing was chosen, so the server keeps what it has; null clears it.
          ...(session.gear
            ? gearBody(session.gear)
            : session.gear === null
              ? { bow_revision: null, arrow_set_revision: null }
              : {}),
        },
      });
    } else if (op.kind === 'end' && op.delete) {
      result = await api.DELETE('/api/sessions/{session_id}/ends/{end_id}/', {
        params: { path: { session_id: op.sessionId, end_id: op.itemId! } },
      });
    } else if (op.kind === 'end') {
      const end = session?.ends.find((e) => e.id === op.itemId);
      if (!end) return { kind: 'ok' };
      result = await api.PUT('/api/sessions/{session_id}/ends/{end_id}/', {
        params: { path: { session_id: op.sessionId, end_id: end.id } },
        body: {
          index: end.index,
          distance_m: end.distance_m,
          face: end.face,
          arrows_per_end: end.arrows_per_end,
          // A plotted shot is sent with its position, and the server works out the score; a typed one with its score.
          shots: end.shots.map((s) =>
            s.x === undefined || s.y === undefined
              ? { id: s.id, value: s.value, is_x: s.is_x, is_miss: s.is_miss, arrow_number: s.arrow_number ?? null }
              : { id: s.id, x: s.x, y: s.y, spot: s.spot ?? 0, value: s.value, is_x: s.is_x, is_miss: s.is_miss, arrow_number: s.arrow_number ?? null },
          ),
        },
      });
    } else if (op.delete) {
      result = await api.DELETE('/api/sessions/{session_id}/volume/{entry_id}/', {
        params: { path: { session_id: op.sessionId, entry_id: op.itemId! } },
      });
    } else {
      const entry = session?.volume.find((v) => v.id === op.itemId);
      if (!entry) return { kind: 'ok' };
      result = await api.PUT('/api/sessions/{session_id}/volume/{entry_id}/', {
        params: { path: { session_id: op.sessionId, entry_id: entry.id } },
        body: { distance_m: entry.distance_m, arrow_count: entry.arrow_count },
      });
    }
    const { response, error, data } = result;
    if (response.ok) return op.kind === 'session' && !op.delete && data?.id && data.id !== op.sessionId ? { kind: 'ok', mergedInto: data.id } : { kind: 'ok' };
    if (op.kind === 'session' && !op.delete && response.status === 410) return { kind: 'gone' };
    if (op.delete && response.status === 404) return { kind: 'ok' }; // already gone
    // Signed out, or the server is having trouble: try again later.
    if (response.status === 401 || response.status >= 500) return { kind: 'retry' };
    return { kind: 'failed', message: `${response.status}: ${errorMessage(error)}` };
  } catch {
    return { kind: 'retry' }; // no connection
  }
}


/**
 * Send queued items one by one, oldest first. An item the server accepts leaves the queue; one it
 * refuses is marked failed and skipped; no connection (or a server error) ends the run and leaves
 * everything for the next attempt. `stop` is checked before each item, to pause the uploads.
 */
export async function drain(
  get: () => LogState,
  dispatch: (action: LogAction) => void,
  sendOp: (state: LogState, op: Op) => Promise<SendResult>,
  stop: () => boolean = () => false,
): Promise<void> {
  for (;;) {
    if (stop()) return;
    const state = get();
    const op = state.outbox.find((o) => !o.error);
    if (!op) return;
    const result = await sendOp(state, op);
    if (result.kind === 'ok') {
      dispatch({ type: 'opDone', key: op.key, rev: op.rev });
      if (result.mergedInto) dispatch({ type: 'replaceSessionId', from: op.sessionId, to: result.mergedInto });
    } else if (result.kind === 'gone') dispatch({ type: 'sessionGone', id: op.sessionId });
    else if (result.kind === 'failed') dispatch({ type: 'opFailed', key: op.key, rev: op.rev, error: result.message });
    else return;
  }
}

/**
 * What the server knows that this device does not, as actions to dispatch in order: ids that were merged or deleted, then
 * every session of yours that changed since `since`, with its ends and volume (the reducer decides what is taken over).
 * Null if the server cannot be reached. `since` is where the last pull got to. A pull that breaks off half way keeps what
 * it fetched and `lastPull` stops at the last session it got, so the next one goes on from there. `skip` are sessions
 * whose delete is still queued.
 */
export async function pull(api: ApiClient, userId: number, since?: string, skip: ReadonlySet<string> = new Set()): Promise<LogAction[] | null> {
  try {
    const query = { owner: userId, ...(since ? { updated_after: since } : {}) };
    const [list, gone] = await Promise.all([api.GET('/api/sessions/', { params: { query } }), api.GET('/api/sessions/gone/', { params: { query } })]);
    if (!list.data || !gone.data) return null;
    const actions: LogAction[] = gone.data.map((g) => (g.merged_into ? { type: 'replaceSessionId', from: g.id, to: g.merged_into } : { type: 'sessionGone', id: g.id }));
    const sessions: LogSession[] = [];
    let reached: string | undefined;
    let complete = true;
    for (const row of list.data.filter((r) => !skip.has(r.id)).sort((a, b) => a.updated_at.localeCompare(b.updated_at))) {
      const detail = await api.GET('/api/sessions/{session_id}/', { params: { path: { session_id: row.id } } });
      if (!detail.data) {
        complete = false;
        break;
      }
      // The screen type carries the archer's name and a stamp; on the device a name would mean "logged for an archer".
      const { owner_name: _name, updated_at: _at, ...mine } = fromServer(detail.data);
      sessions.push({ ...mine, opened_by: detail.data.opened_by ?? undefined, opened_by_name: detail.data.opened_by_name ?? undefined, keep: true });
      reached = detail.data.updated_at;
    }
    if (!complete && sessions.length === 0) return null;
    const stamps = complete ? [...list.data.map((r) => r.updated_at), ...gone.data.map((g) => g.at ?? '')].filter(Boolean).sort() : [reached ?? ''];
    actions.push({ type: 'pulled', sessions, lastPull: stamps.at(-1) || undefined });
    return actions;
  } catch {
    return null;
  }
}
