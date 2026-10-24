// Evaluations over time: one line per group of the form for the coach's ratings and one for the archer's own.
// A criterion is followed by its key, which stays the same when a form gets a new version; the label and the group
// come from the newest evaluation that has it.

import type { RatedScore } from '@/lib/evaluation'

export type Kind = 'coach' | 'self'
export type FormCriterion = { key: string; label: string; group: string }
export type Evaluated = {
  id: number
  kind?: Kind
  date?: string
  created_at: string
  goals?: string
  criteria: { [key: string]: unknown }[]
  scores: Pick<RatedScore, 'criterion' | 'rating'>[]
}

export type Point = { date: string; value: number }
export type CriterionTrend = { key: string; label: string; latest: number | null; change: number | null }
export type GroupProgress = {
  group: string
  coach: Point[]
  self: Point[]
  criteria: { key: string; label: string; coach: CriterionTrend; self: CriterionTrend }[]
}

export const dateOf = (e: Pick<Evaluated, 'date' | 'created_at'>): string => e.date ?? e.created_at.slice(0, 10)
const kindOf = (e: Evaluated): Kind => e.kind ?? 'coach'

/** Oldest first; evaluations of one day in the order they were made. */
export function byDate<T extends Pick<Evaluated, 'id' | 'date' | 'created_at'>>(list: T[]): T[] {
  return [...list].sort((a, b) => dateOf(a).localeCompare(dateOf(b)) || a.id - b.id)
}

const mean = (values: number[]) => values.reduce((sum, v) => sum + v, 0) / values.length
const rounded = (n: number) => Math.round(n * 10) / 10

export function progress(list: Evaluated[]): GroupProgress[] {
  const evaluations = byDate(list)
  // Label and group of every criterion, the newest form wins; the order is that of the newest form, then older criteria.
  const forms = new Map<string, FormCriterion>()
  for (const e of evaluations) for (const c of e.criteria as FormCriterion[]) forms.set(c.key, { key: c.key, label: c.label, group: c.group })
  const newest = evaluations.length ? (evaluations[evaluations.length - 1]!.criteria as FormCriterion[]).map((c) => c.key) : []
  const order = [...newest, ...[...forms.keys()].filter((k) => !newest.includes(k))]

  const groups = new Map<string, FormCriterion[]>()
  for (const key of order) {
    const c = forms.get(key)!
    groups.set(c.group, [...(groups.get(c.group) ?? []), c])
  }

  const ratingOf = (e: Evaluated, key: string) => e.scores.find((s) => s.criterion === key)?.rating ?? null
  const trend = (c: FormCriterion, kind: Kind): CriterionTrend => {
    const rated = evaluations.filter((e) => kindOf(e) === kind).map((e) => ratingOf(e, c.key)).filter((r): r is number => r !== null)
    const latest = rated.length ? rated[rated.length - 1]! : null
    const before = rated.length > 1 ? rated[rated.length - 2]! : null
    return { key: c.key, label: c.label, latest, change: latest !== null && before !== null ? latest - before : null }
  }
  const line = (items: FormCriterion[], kind: Kind): Point[] =>
    evaluations
      .filter((e) => kindOf(e) === kind)
      .flatMap((e) => {
        const ratings = items.map((c) => ratingOf(e, c.key)).filter((r): r is number => r !== null)
        return ratings.length ? [{ date: dateOf(e), value: rounded(mean(ratings)) }] : []
      })

  return [...groups].map(([group, items]) => ({
    group,
    coach: line(items, 'coach'),
    self: line(items, 'self'),
    criteria: items.map((c) => ({ key: c.key, label: c.label, coach: trend(c, 'coach'), self: trend(c, 'self') })),
  }))
}

/** The goals of the newest coach evaluation and of the newest self-assessment, each only if it has goals: the next evaluation replaces them. */
export function currentGoals<T extends Evaluated>(list: T[]): { kind: Kind; evaluation: T }[] {
  const evaluations = byDate(list)
  return (['coach', 'self'] as Kind[]).flatMap((kind) => {
    const latest = evaluations.filter((e) => kindOf(e) === kind).pop()
    return latest?.goals?.trim() ? [{ kind, evaluation: latest }] : []
  })
}
