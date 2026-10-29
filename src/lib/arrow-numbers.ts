// Numbered arrows: which number to suggest next, how many numbers a set has, how a numbered arrow is shown.
import { chosenKeys, type Equipment, type LogSession, type LogShot } from './log-model.ts';

/** When the arrow set has no count (or none is chosen) the row offers this many numbers; an end holds at most 12 arrows. */
export const DEFAULT_SET_SIZE = 12;
export const MAX_ARROW_NUMBER = 99;

/** How many numbers the row offers: the count of the session's arrow set, else the default. */
export function setSize(session: Pick<LogSession, 'gear'>, equipment: Equipment): number {
  const key = chosenKeys(equipment, session.gear).arrowSetKey;
  const count = key === null ? null : equipment.arrowSets.find((a) => a.key === key)?.count;
  return count && count >= 1 ? Math.min(count, MAX_ARROW_NUMBER) : DEFAULT_SET_SIZE;
}

/** The number the last arrow of the ends before `endIndex` had, or null when none was numbered (the start of the sequence). */
export function lastNumberBefore(session: Pick<LogSession, 'ends'>, endIndex: number): number | null {
  const earlier = [...session.ends].filter((e) => e.index < endIndex).sort((a, b) => a.index - b.index);
  for (const end of earlier.reverse()) {
    for (const shot of [...end.shots].reverse()) if (shot.arrow_number != null) return shot.arrow_number;
  }
  return null;
}

/** The next number in the set after `after` (1 when nothing was numbered yet), skipping those `used` in this end; null when all are used. */
export function nextNumber(size: number, used: number[], after: number | null): number | null {
  for (let step = 1; step <= size; step++) {
    const n = (((after ?? 0) + step - 1) % size) + 1;
    if (!used.includes(n)) return n;
  }
  return null;
}

/** "9", or "9 (#4)" for a numbered arrow. */
export const withNumber = (label: string, shot: Pick<LogShot, 'arrow_number'>) => (shot.arrow_number != null ? `${label} (#${shot.arrow_number})` : label);
