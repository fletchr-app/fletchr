// The schedule of a team as the phones use it: which training to suggest for a time. No Vue: the server computes the
// occurrences (with time zones and DST), so this only compares instants.
import type { components } from './api-types.ts';

export type AgendaItem = components['schemas']['AgendaItem'];
export type EventKind = AgendaItem['kind'];

/** What a row says about the training it is linked to: the id the server knows it by, how to make the row when it does not exist yet, and enough to show it. */
export type EventLink = {
  id: string;
  /** With `date`: the slot of an occurrence that is no row yet; the server makes it when the link arrives. */
  slot?: string | null;
  date?: string | null;
  name?: string;
  kind?: EventKind;
  start?: string;
  team?: number;
  team_name?: string;
};

export const linkOf = (item: AgendaItem): EventLink => ({
  id: item.id, slot: item.slot, date: item.date, name: item.name, kind: item.kind, start: item.start, team: item.team, team_name: item.team_name,
});

type Options = {
  /** A competition session is offered the competitions first. */
  preferKind?: EventKind;
  /** Only the events of these teams (the teams you may write notes in). */
  teams?: readonly number[];
};

/**
 * The trainings that take place at `start`, or while `[start, end]` lasts: not cancelled, sorted by start, `preferKind` first.
 * A moment counts inside a training from its start up to, not including, its end; two spans count when they overlap,
 * without margin. Nothing is chosen for the user: they confirm one of these, or none.
 */
export function suggestEvents(agenda: readonly AgendaItem[], start: Date | string, end?: Date | string | null, options: Options = {}): AgendaItem[] {
  const from = new Date(start).getTime();
  const to = end ? new Date(end).getTime() : from;
  const point = to <= from;
  return agenda
    .filter((item) => {
      if (item.cancelled || (options.teams && !options.teams.includes(item.team))) return false;
      const s = new Date(item.start).getTime();
      const e = new Date(item.end).getTime();
      return point ? s <= from && from < e : from < e && to > s;
    })
    .sort((a, b) => {
      const kind = Number(b.kind === options.preferKind) - Number(a.kind === options.preferKind);
      return kind || a.start.localeCompare(b.start) || a.team_name.localeCompare(b.team_name);
    });
}

/** The one training to preselect: exactly one suggestion, else none. */
export const preselected = (suggestions: readonly AgendaItem[]): AgendaItem | null => (suggestions.length === 1 ? suggestions[0]! : null);

/** The text to show a link by: its name, or the message key of its kind when it has none (the caller translates). */
export const eventTitle = (link: Pick<EventLink, 'name' | 'kind'>) => link.name || `event.kind.${link.kind ?? 'training'}`;
