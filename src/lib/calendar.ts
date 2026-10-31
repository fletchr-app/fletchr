// Dates for the month view of the schedule. A day is a `YYYY-MM-DD` string on the device's clock, a month is `YYYY-MM`. Days are
// stepped as calendar dates (never as 24 hours), so the days of a time change stay one step long. No Vue, no time-zone names.
import { type AgendaItem, dayKey } from './schedule.ts';

const pad = (n: number) => String(n).padStart(2, '0');
const key = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (day: string) => {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d);
};

/** The day `n` days after `day` (before it when negative). */
export function addDays(day: string, n: number): string {
  const d = parse(day);
  d.setDate(d.getDate() + n);
  return key(d);
}

/** The month before or after `month` (`YYYY-MM`). */
export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

/** The weekday a week starts on, as `Date.getDay()` numbers it (0 is Sunday), from the locale; Monday when the WebView cannot say. */
export function firstWeekday(locale: string): number {
  try {
    const l = new Intl.Locale(locale) as Intl.Locale & { getWeekInfo?: () => { firstDay: number }; weekInfo?: { firstDay: number } };
    const first = l.getWeekInfo?.().firstDay ?? l.weekInfo?.firstDay;
    return first === undefined ? 1 : first % 7; // Intl counts Monday 1 to Sunday 7
  } catch {
    return 1;
  }
}

/** The days to show for `month`: whole weeks from the first to the last day of the month, starting on `firstDay` (0 is Sunday). */
export function monthGrid(month: string, firstDay: number): string[] {
  const first = `${month}-01`;
  const lead = (parse(first).getDay() - firstDay + 7) % 7;
  const last = key(new Date(parse(first).getFullYear(), parse(first).getMonth() + 1, 0));
  const trail = (firstDay + 6 - parse(last).getDay() + 7) % 7;
  const days: string[] = [];
  for (let day = addDays(first, -lead); day <= addDays(last, trail); day = addDays(day, 1)) days.push(day);
  return days;
}

/** The request range for some days: local midnight of the first day up to local midnight of the day after the last, as instants. */
export function rangeOf(days: readonly string[]): { from: string; to: string } {
  return { from: parse(days[0]!).toISOString(), to: parse(addDays(days[days.length - 1]!, 1)).toISOString() };
}

/** The days an item covers on this clock, from its start up to, not including, its end; a training that ends at midnight stays on its day. */
export function daysOf(item: Pick<AgendaItem, 'start' | 'end'>): string[] {
  const first = dayKey(item.start);
  const endDay = dayKey(item.end);
  const endsAtMidnight = new Date(item.end).getTime() === parse(endDay).getTime();
  const last = endsAtMidnight ? addDays(endDay, -1) : endDay;
  const days = [first];
  for (let day = addDays(first, 1); day <= last; day = addDays(day, 1)) days.push(day);
  return days;
}

/** For each day with something on: how many trainings take place and how many are cancelled. */
export function dotsByDay(items: readonly AgendaItem[]): Map<string, { count: number; cancelled: number }> {
  const dots = new Map<string, { count: number; cancelled: number }>();
  for (const item of items) {
    for (const day of daysOf(item)) {
      const dot = dots.get(day) ?? { count: 0, cancelled: 0 };
      if (item.cancelled) dot.cancelled += 1;
      else dot.count += 1;
      dots.set(day, dot);
    }
  }
  return dots;
}
