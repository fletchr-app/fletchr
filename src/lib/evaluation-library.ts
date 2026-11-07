// The evaluations the server has that are yours to keep on the phone: those about you (shared with you by a coach, or your
// own) and those you wrote as a coach. They are read without a connection (#84). No Vue here, so the rules can be tested.
// Evaluations still waiting to upload are not here, they are in the evaluation queue.
import type { ApiClient } from './auth-session.ts';
import type { components } from './api-types.ts';
import { askSince } from './sync-overlap.ts';

export type KnownEvaluation = components['schemas']['Evaluation'];

export type EvaluationLibraryState = {
  evaluations: KnownEvaluation[];
  /** Where the last pull got to (the newest change the server sent). */
  lastPull?: string;
};

export const EMPTY_EVALUATION_LIBRARY: EvaluationLibraryState = { evaluations: [] };

export type EvaluationLibraryAction =
  | { type: 'pulled'; changed: KnownEvaluation[]; gone: string[]; lastPull?: string }
  | { type: 'saved'; evaluations: KnownEvaluation[] }
  | { type: 'forget'; uid: string }
  | { type: 'clear' };

/** Newest first, like the server's list. */
const newestFirst = (a: KnownEvaluation, b: KnownEvaluation) => (b.date ?? '').localeCompare(a.date ?? '') || b.id - a.id;

const replace = (state: EvaluationLibraryState, changed: KnownEvaluation[], gone: string[]) => {
  const uids = new Set([...changed.map((e) => e.uid), ...gone]);
  return [...state.evaluations.filter((e) => !uids.has(e.uid)), ...changed].sort(newestFirst);
};

export function reduceEvaluationLibrary(state: EvaluationLibraryState, action: EvaluationLibraryAction): EvaluationLibraryState {
  switch (action.type) {
    case 'pulled':
      return { evaluations: replace(state, action.changed, action.gone), lastPull: action.lastPull ?? state.lastPull };
    case 'saved': {
      // The screens poll: a list that holds nothing new must not rewrite the file.
      const known = new Map(state.evaluations.map((e) => [e.uid, e.updated_at]));
      const news = action.evaluations.filter((e) => known.get(e.uid) !== e.updated_at);
      return news.length === 0 ? state : { ...state, evaluations: replace(state, news, []) };
    }
    case 'forget':
      return state.evaluations.some((e) => e.uid === action.uid) ? { ...state, evaluations: replace(state, [], [action.uid]) } : state;
    case 'clear':
      return EMPTY_EVALUATION_LIBRARY;
  }
}

/** Whether the phone keeps an evaluation: it is about you or you wrote it. Those of other people that a coach reads are online only. */
export const isKept = (e: Pick<KnownEvaluation, 'archer' | 'author'>, me: number): boolean => e.archer === me || e.author === me;

/** What the screens ask the server for. */
export type EvaluationQuery = { archer?: number; author?: number };

/** The copy answers like the server's list: filtered, newest first. */
export function selectEvaluations(state: EvaluationLibraryState, query: EvaluationQuery = {}): KnownEvaluation[] {
  return state.evaluations.filter((e) => (query.archer === undefined || e.archer === query.archer) && (query.author === undefined || e.author === query.author));
}

export type EvaluationPull = { changed: KnownEvaluation[]; gone: string[]; lastPull?: string };

/** Evaluations about you and by you that changed since `since`, and the uids deleted (or taken back) since. Null if the server cannot be reached. */
export async function pullEvaluations(api: ApiClient, userId: number, since?: string): Promise<EvaluationPull | null> {
  try {
    const asked = askSince(since);
    const query = asked ? { updated_after: asked } : {};
    const [about, by, gone] = await Promise.all([
      api.GET('/api/evaluations/', { params: { query: { archer: userId, ...query } } }),
      api.GET('/api/evaluations/', { params: { query: { author: userId, ...query } } }),
      api.GET('/api/gone/', { params: { query: { kind: 'evaluation', ...query } } }),
    ]);
    if (!about.data || !by.data || !gone.data) return null;
    const changed = [...new Map([...about.data, ...by.data].map((e) => [e.uid, e])).values()];
    const stamps = [...changed.map((e) => e.updated_at), ...gone.data.map((g) => g.at)].sort();
    return { changed, gone: gone.data.map((g) => g.uid), lastPull: stamps.at(-1) };
  } catch {
    return null;
  }
}
