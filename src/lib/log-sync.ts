// Uploading the queue of a local log. No React here, so the retry rules can be tested with `npm test`.
import type { ApiClient } from './auth-session.ts';
import { errorMessage } from './errors.ts';
import type { LogAction, LogState, Op } from './log-model.ts';

export type SendResult = { kind: 'ok' } | { kind: 'retry' } | { kind: 'failed'; message: string };

/** Upload one queued item, with its body taken from the current local data. */
export async function send(api: ApiClient, state: LogState, op: Op): Promise<SendResult> {
  const session = state.sessions.find((s) => s.id === op.sessionId);
  try {
    let result: { response: Response; error?: unknown };
    if (op.kind === 'session' && op.delete) {
      result = await api.DELETE('/api/sessions/{session_id}/', { params: { path: { session_id: op.sessionId } } });
    } else if (op.kind === 'session') {
      if (!session) return { kind: 'ok' };
      result = await api.PUT('/api/sessions/{session_id}/', {
        params: { path: { session_id: op.sessionId } },
        body: {
          started_at: session.started_at,
          ended_at: session.ended_at,
          type: session.type,
          environment: session.environment,
          location: session.location,
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
          shots: end.shots.map((s) => ({ id: s.id, value: s.value, is_x: s.is_x, is_miss: s.is_miss })),
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
    const { response, error } = result;
    if (response.ok) return { kind: 'ok' };
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
 * everything for the next attempt.
 */
export async function drain(
  get: () => LogState,
  dispatch: (action: LogAction) => void,
  sendOp: (state: LogState, op: Op) => Promise<SendResult>,
): Promise<void> {
  for (;;) {
    const state = get();
    const op = state.outbox.find((o) => !o.error);
    if (!op) return;
    const result = await sendOp(state, op);
    if (result.kind === 'ok') dispatch({ type: 'opDone', key: op.key, rev: op.rev });
    else if (result.kind === 'failed') dispatch({ type: 'opFailed', key: op.key, rev: op.rev, error: result.message });
    else return;
  }
}
