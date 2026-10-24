// The grid of a gallery in sections, one per day, newest first. Local days: a photo taken at 23:30 belongs to that evening.

export type Day<T> = { day: string; items: T[] }

const dayOf = (iso: string) => {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Items in the order they come in, grouped by the day they were taken. The day is `YYYY-MM-DD`. */
export function byDay<T extends { taken_at: string }>(items: T[]): Day<T>[] {
  const days: Day<T>[] = []
  for (const item of items) {
    const day = dayOf(item.taken_at)
    const last = days[days.length - 1]
    if (last?.day === day) last.items.push(item)
    else days.push({ day, items: [item] })
  }
  return days
}

/** A heading such as "Saturday, 24 October 2026", in the language of the app. */
export function dayTitle(day: string, locale?: string): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number]
  return new Date(y, m - 1, d).toLocaleDateString(locale, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
}
