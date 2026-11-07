// Uploading queued evaluations. No Vue here, so the rules can be tested with `npm test`.
import type { ApiClient } from './auth-session.ts';
import type { components } from './api-types.ts';
import { errorMessage } from './errors.ts';
import type { EvaluationAction, EvaluationsState, QueuedEvaluation } from './evaluation-store.ts';

/** `id` is the number the server gave the evaluation. `gone`: the server deleted it (the uid is known there). */
export type SendResult = { kind: 'ok'; id: number } | { kind: 'retry' } | { kind: 'gone'; message: string } | { kind: 'failed'; message: string };

type Body = components['schemas']['EvaluationRequest'];

/** Upload one evaluation with `PUT` by its uid, which is safe to repeat. */
export async function sendEvaluation(api: ApiClient, evaluation: QueuedEvaluation): Promise<SendResult> {
  const body: Body = {
    archer: evaluation.archer,
    team: evaluation.team,
    template: evaluation.template,
    kind: evaluation.kind,
    date: evaluation.date,
    comment: evaluation.comment,
    goals: evaluation.goals,
    ...(evaluation.kind === 'coach' ? { visibility: evaluation.visibility } : {}),
    scores: evaluation.scores,
  };
  try {
    const { response, data, error } = await api.PUT('/api/evaluations/{uid}/', { params: { path: { uid: evaluation.uid } }, body });
    if (data) return { kind: 'ok', id: data.id };
    // No login or a server error is tried again later; an evaluation the server refuses is the evaluation's fault.
    if (response.status === 401 || response.status >= 500) return { kind: 'retry' };
    if (response.status === 410) return { kind: 'gone', message: errorMessage(error) };
    return { kind: 'failed', message: errorMessage(error) };
  } catch {
    return { kind: 'retry' }; // no connection
  }
}

/**
 * Send queued evaluations one by one, oldest first. One whose photo or clip is still waiting to go up is passed over for
 * now (`blocked`); one the server accepts leaves the queue; one it refuses is marked failed (deleted there: marked `gone`);
 * no connection (or a server error) ends the run and leaves everything for the next attempt.
 */
export async function drainEvaluations(
  get: () => EvaluationsState,
  dispatch: (action: EvaluationAction) => void,
  sendOne: (evaluation: QueuedEvaluation) => Promise<SendResult>,
  blocked: (evaluation: QueuedEvaluation) => boolean = () => false,
  stop: () => boolean = () => false,
): Promise<void> {
  for (;;) {
    if (stop()) return;
    const next = get().evaluations.find((e) => !e.error && !blocked(e));
    if (!next) return;
    const result = await sendOne(next);
    if (result.kind === 'ok') dispatch({ type: 'remove', uid: next.uid });
    else if (result.kind === 'gone') dispatch({ type: 'failed', uid: next.uid, error: result.message, gone: true });
    else if (result.kind === 'failed') dispatch({ type: 'failed', uid: next.uid, error: result.message });
    else return;
  }
}
