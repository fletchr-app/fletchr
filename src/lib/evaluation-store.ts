// Evaluations written on this device that have not reached the server yet (#84). Pure functions only (no Vue, no storage),
// so they can be tested with `npm test`. An evaluation gets an id (`uid`) when it is written, so it can be uploaded with a
// repeatable `PUT`, after the photo or clip it names as evidence. Once the server has it, it leaves this queue and the
// server's list shows it. A change to an evaluation the server has is queued the same way (same uid, the whole form again).
import type { RatedScore } from './evaluation.ts';

export type QueuedEvaluation = {
  uid: string;
  archer: number;
  archer_name: string;
  team: number;
  /** The form (template id); an evaluation that is changed keeps the one it was made with. */
  template: number;
  kind: 'coach' | 'self';
  date: string;
  comment: string;
  goals: string;
  visibility: 'shared' | 'coach_only';
  scores: RatedScore[];
  created_at: string;
  /** Set when the server refused it, or it was deleted there. */
  error?: string;
  /** The server deleted it while this change was waiting: sending it again writes a new evaluation. */
  gone?: boolean;
};

export type EvaluationsState = { evaluations: QueuedEvaluation[] };
export const EMPTY_EVALUATIONS: EvaluationsState = { evaluations: [] };

export type EvaluationAction =
  | { type: 'load'; state: EvaluationsState }
  | { type: 'reset' }
  /** A new evaluation, or the same uid again (a queued one that is changed): replaced as a whole. */
  | { type: 'add'; evaluation: QueuedEvaluation }
  | { type: 'remove'; uid: string }
  | { type: 'failed'; uid: string; error: string; gone?: boolean }
  /** Tried again. One the server had deleted goes up as a new evaluation, with a uid of its own. */
  | { type: 'retryFailed'; fresh: () => string }
  | { type: 'discardFailed' };

export function reduce(state: EvaluationsState, action: EvaluationAction): EvaluationsState {
  switch (action.type) {
    case 'load':
      return { ...EMPTY_EVALUATIONS, ...action.state };
    case 'reset':
      return EMPTY_EVALUATIONS;
    case 'add': {
      const { error: _error, gone: _gone, ...fresh } = action.evaluation;
      const known = state.evaluations.some((e) => e.uid === fresh.uid);
      return { evaluations: known ? state.evaluations.map((e) => (e.uid === fresh.uid ? fresh : e)) : [...state.evaluations, fresh] };
    }
    case 'remove':
      return { evaluations: state.evaluations.filter((e) => e.uid !== action.uid) };
    case 'failed':
      return { evaluations: state.evaluations.map((e) => (e.uid === action.uid ? { ...e, error: action.error, ...(action.gone ? { gone: true } : {}) } : e)) };
    case 'retryFailed':
      return {
        evaluations: state.evaluations.map(({ error: _error, gone, ...e }) => (gone ? { ...e, uid: action.fresh() } : e)),
      };
    case 'discardFailed':
      return { evaluations: state.evaluations.filter((e) => !e.error) };
  }
}

/** The queued evaluations about this archer, oldest first. */
export const pendingEvaluations = (state: EvaluationsState, archer: number): QueuedEvaluation[] => state.evaluations.filter((e) => e.archer === archer);

/** The photos and clips the queued evaluations name as evidence. */
export const evidenceOf = (e: QueuedEvaluation): string[] => e.scores.flatMap((s) => (s.media ? [s.media] : []));
