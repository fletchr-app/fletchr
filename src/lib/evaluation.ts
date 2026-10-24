// Evaluations: a form (criteria in groups, rated 1 to `scale`) filled in for an archer on a date.

export type Criterion = { key: string; label: string; group: string; description: string; low: string; high: string }
export type RatedScore = { criterion: string; rating: number; comment?: string; media?: string | null; frame?: number | null; time_ms?: number | null }

/** The criteria in the order of the form, with the groups in the order they first appear. */
export function groupCriteria<T extends { group: string }>(criteria: T[]): { group: string; items: T[] }[] {
  const groups: { group: string; items: T[] }[] = []
  for (const item of criteria) {
    const last = groups.find((g) => g.group === item.group)
    if (last) last.items.push(item)
    else groups.push({ group: item.group, items: [item] })
  }
  return groups
}

/** The mean of the ratings, or null when nothing is rated. Rounded to one decimal. */
export function average(scores: { rating: number }[]): number | null {
  if (scores.length === 0) return null
  return Math.round((scores.reduce((sum, s) => sum + s.rating, 0) / scores.length) * 10) / 10
}

/** Ratings 1 to `scale`. */
export const ratings = (scale: number): number[] => Array.from({ length: scale }, (_, i) => i + 1)

/** The criterion rows of a form with what is rated for each, in the order of the form. Unrated criteria are left out of the scores that go to the server. */
export function toScores(rated: Record<string, { rating: number | null; comment: string; media: string | null; frame: number | null; timeMs: number | null }>): RatedScore[] {
  return Object.entries(rated)
    .filter(([, r]) => r.rating !== null)
    .map(([criterion, r]) => ({
      criterion,
      rating: r.rating!,
      comment: r.comment.trim(),
      ...(r.media ? { media: r.media, frame: r.frame, time_ms: r.timeMs } : {}),
    }))
}

/** A new key for a criterion typed in the app: the server makes it from the label when none is given, so a new row has none. */
export const blankCriterion = (group = ''): Partial<Criterion> & { label: string; group: string } => ({ label: '', group })

/** Moves item `from` to `to` in a copy of the list. */
export function moved<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length || from === to) return list
  const copy = [...list]
  copy.splice(to, 0, copy.splice(from, 1)[0]!)
  return copy
}
