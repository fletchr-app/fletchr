// Uploading and reading equipment. No Vue here, so the retry rules can be tested with `npm test`.
import type { ApiClient } from './auth-session.ts';
import { errorMessage } from './errors.ts';
import type { components } from './api-types.ts';
import { type EquipmentAction, type EquipmentKind, type EquipmentOp, type EquipmentState, fieldsOf, type ServerItem, type Values } from './equipment-store.ts';

export type SendResult =
  | { kind: 'ok'; result?: { id: number; revision_uid: string; revision_number: number } }
  | { kind: 'retry' }
  | { kind: 'failed'; message: string };

type BowBody = components['schemas']['BowPutRequest'];
type ArrowSetBody = components['schemas']['ArrowSetPutRequest'];

/** Upload one queued change, with its body taken from the current local data. */
export async function sendEquipment(api: ApiClient, state: EquipmentState, op: EquipmentOp): Promise<SendResult> {
  const item = state.items.find((i) => i.kind === op.kind && i.uid === op.uid);
  try {
    if (op.delete) {
      const { response, error } =
        op.kind === 'bow'
          ? await api.DELETE('/api/bows/{id}/', { params: { path: { id: op.id! } } })
          : await api.DELETE('/api/arrow-sets/{id}/', { params: { path: { id: op.id! } } });
      if (response.ok || response.status === 404) return { kind: 'ok' };
      return outcome(response, error);
    }
    if (!item || item.revisions.length === 0) return { kind: 'ok' };
    const body = { ...item.values, is_active: item.is_active, revision_uid: item.revisions[0].uid };
    const { response, data, error } =
      op.kind === 'bow'
        ? await api.PUT('/api/bows/{uid}/', { params: { path: { uid: op.uid } }, body: body as unknown as BowBody })
        : await api.PUT('/api/arrow-sets/{uid}/', { params: { path: { uid: op.uid } }, body: body as unknown as ArrowSetBody });
    if (data) return { kind: 'ok', result: { id: data.id, revision_uid: data.revision_uid, revision_number: data.revision_number } };
    return outcome(response, error);
  } catch {
    return { kind: 'retry' }; // no connection
  }
}

/** A refused request is the item's fault and stays failed; no login or a server error is tried again later. */
function outcome(response: Response, error: unknown): SendResult {
  if (response.status === 401 || response.status >= 500) return { kind: 'retry' };
  return { kind: 'failed', message: errorMessage(error) };
}

/**
 * Send queued changes one by one, oldest first. One the server accepts leaves the queue; one it refuses is marked
 * failed and skipped; no connection (or a server error) ends the run and leaves everything for the next attempt.
 */
export async function drainEquipment(
  get: () => EquipmentState,
  dispatch: (action: EquipmentAction) => void,
  sendOp: (state: EquipmentState, op: EquipmentOp) => Promise<SendResult>,
  stop: () => boolean = () => false,
): Promise<void> {
  for (;;) {
    if (stop()) return;
    const state = get();
    const op = state.outbox.find((o) => !o.error);
    if (!op) return;
    const result = await sendOp(state, op);
    if (result.kind === 'ok') dispatch({ type: 'opDone', key: op.key, rev: op.rev, result: result.result });
    else if (result.kind === 'failed') dispatch({ type: 'opFailed', key: op.key, rev: op.rev, error: result.message });
    else return;
  }
}

type ServerRow = { id: number; uid: string; is_active?: boolean; created_at: string; revision: number; revision_number: number; revision_uid: string } & Record<string, unknown>;

function toItem(kind: EquipmentKind, row: ServerRow): ServerItem {
  const values: Values = Object.fromEntries(
    fieldsOf(kind).map((f) => {
      const v = row[f.key];
      return [f.key, v === undefined || v === null ? null : typeof v === 'number' ? v : String(v)];
    }),
  );
  return {
    kind,
    uid: row.uid,
    id: row.id,
    is_active: row.is_active ?? true,
    created_at: row.created_at,
    values,
    revision: { uid: row.revision_uid, id: row.revision, number: row.revision_number },
  };
}

/** Your own bows and arrow sets, or null if the server cannot be reached. */
export async function pullEquipment(api: ApiClient, userId: number): Promise<ServerItem[] | null> {
  try {
    const query = { owner: userId };
    const [bows, arrowSets] = await Promise.all([api.GET('/api/bows/', { params: { query } }), api.GET('/api/arrow-sets/', { params: { query } })]);
    if (!bows.data || !arrowSets.data) return null;
    return [...bows.data.map((b) => toItem('bow', b as unknown as ServerRow)), ...arrowSets.data.map((a) => toItem('arrowSet', a as unknown as ServerRow))];
  } catch {
    return null;
  }
}
