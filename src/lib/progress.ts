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

/** The criteria of oldest-to-newest evaluations in groups: the newest form wins for label and group; the order is that of the newest form, then older criteria. */
function formGroups(evaluations: Evaluated[]): Map<string, FormCriterion[]> {
  const forms = new Map<string, FormCriterion>()
  for (const e of evaluations) for (const c of e.criteria as FormCriterion[]) forms.set(c.key, { key: c.key, label: c.label, group: c.group })
  const newest = evaluations.length ? (evaluations[evaluations.length - 1]!.criteria as FormCriterion[]).map((c) => c.key) : []
  const order = [...newest, ...[...forms.keys()].filter((k) => !newest.includes(k))]
  const groups = new Map<string, FormCriterion[]>()
  for (const key of order) {
    const c = forms.get(key)!
    groups.set(c.group, [...(groups.get(c.group) ?? []), c])
  }
  return groups
}

export function progress(list: Evaluated[]): GroupProgress[] {
  const evaluations = byDate(list)
  const groups = formGroups(evaluations)

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

export type Mover = { key: string; label: string; group: string; latest: number; change: number | null }

/** From the coach's ratings: what went up the most since the rating before, and what is rated lowest now (the lowest first, `limit` each). */
export function movers(groups: GroupProgress[], limit = 3): { improved: Mover[]; attention: Mover[] } {
  const all: Mover[] = groups.flatMap((g) => g.criteria.filter((c) => c.coach.latest !== null).map((c) => ({ key: c.key, label: c.label, group: g.group, latest: c.coach.latest!, change: c.coach.change })))
  const improved = all.filter((m) => (m.change ?? 0) > 0).sort((a, b) => b.change! - a.change! || a.latest - b.latest).slice(0, limit)
  const attention = [...all].sort((a, b) => a.latest - b.latest || (a.change ?? 0) - (b.change ?? 0)).slice(0, limit)
  return { improved, attention }
}

export type RadarAxis = { group: string; latest: number; earlier: number | null }

/** One axis per group that the coach rated: the latest mean and, when there is more than one evaluation, the mean of the first. */
export function radarAxes(groups: GroupProgress[]): RadarAxis[] {
  return groups
    .filter((g) => g.coach.length > 0)
    .map((g) => ({ group: g.group, latest: g.coach[g.coach.length - 1]!.value, earlier: g.coach.length > 1 ? g.coach[0]!.value : null }))
}

export type TeamCriterion = { key: string; label: string; mean: number; archers: number }
export type TeamGroup = { group: string; mean: number; criteria: TeamCriterion[] }

/** The team across its archers: for each criterion the mean of every archer's newest coach evaluation, and for each group the mean of those ratings. */
export function teamAverages(list: (Evaluated & { archer: number })[]): { archers: number; groups: TeamGroup[] } {
  const evaluations = byDate(list.filter((e) => kindOf(e) === 'coach'))
  const newest = new Map<number, (typeof evaluations)[number]>()
  for (const e of evaluations) newest.set(e.archer, e) // oldest first, so the last one stays
  const latest = [...newest.values()]
  const ratings = (key: string) => latest.flatMap((e) => e.scores.filter((s) => s.criterion === key).map((s) => s.rating))
  const groups: TeamGroup[] = []
  for (const [group, items] of formGroups(evaluations)) {
    const criteria = items.flatMap((c) => {
      const r = ratings(c.key)
      return r.length ? [{ key: c.key, label: c.label, mean: rounded(mean(r)), archers: r.length }] : []
    })
    const all = items.flatMap((c) => ratings(c.key))
    if (all.length) groups.push({ group, mean: rounded(mean(all)), criteria })
  }
  return { archers: latest.length, groups }
}
