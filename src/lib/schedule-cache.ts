// The copy of your teams' schedule on the phone (#104, phase 6), so trainings are suggested and the agenda can be read
// without a connection. The phone keeps what the server's agenda said (occurrences merged with the event rows); it never
// computes occurrences itself. Every pull replaces the whole copy. No Vue here, so the rules can be tested.
import type { ApiClient } from './auth-session.ts';
import type { components } from './api-types.ts';
import type { AgendaItem } from './schedule.ts';

type Team = components['schemas']['Team'];
type Member = components['schemas']['Member'];

/** A member of a team you coach, as much as the phone needs to offer the archer offline (no address, no picture). */
export type CachedMember = Pick<Member, 'user_id' | 'name' | 'role' | 'also_shoots' | 'managed'>;

export type ScheduleCache = {
  /** Your teams with your role in each. */
  teams: Team[];
  /** The members of the teams you coach, by team id. */
  members: Record<string, CachedMember[]>;
  agenda: AgendaItem[];
  /** The span the agenda covers. */
  from: string | null;
  to: string | null;
  pulledAt: string | null;
};

export const EMPTY_SCHEDULE: ScheduleCache = { teams: [], members: {}, agenda: [], from: null, to: null, pulledAt: null };

const DAY_MS = 86_400_000;
/** Back as far as a session may be backdated (`MAX_BACKDATE_DAYS`), ahead for the agenda list; together under the server's 120 days. */
export const BACK_DAYS = 31;
export const AHEAD_DAYS = 88;

export const windowAt = (at: Date): { from: string; to: string } => ({
  from: new Date(at.getTime() - BACK_DAYS * DAY_MS).toISOString(),
  to: new Date(at.getTime() + AHEAD_DAYS * DAY_MS).toISOString(),
});

export type SchedulePull = { teams: Team[]; members: Record<string, CachedMember[]>; agenda: AgendaItem[]; from: string; to: string };

/** The copy after a pull that went through: everything replaced, so a training cancelled or moved elsewhere and the trainings of a team you left are gone. */
export const pulled = (pull: SchedulePull, at: Date): ScheduleCache => ({ ...pull, pulledAt: at.toISOString() });

const overlaps = (item: AgendaItem, from: string, to: string) => new Date(item.start).getTime() < new Date(to).getTime() && new Date(item.end).getTime() > new Date(from).getTime();

/** The cached trainings that take place in `[from, to)`, of one team when given, in order. */
export const itemsFor = (state: ScheduleCache, query: { team?: number; from: string; to: string }): AgendaItem[] =>
  state.agenda.filter((item) => (query.team === undefined || item.team === query.team) && overlaps(item, query.from, query.to)).sort((a, b) => a.start.localeCompare(b.start));

/** Whether the copy has the whole of `[from, to)`: a month outside it is not on the phone. */
export const covers = (state: ScheduleCache, from: string, to: string): boolean =>
  state.from !== null && state.to !== null && new Date(state.from).getTime() <= new Date(from).getTime() && new Date(to).getTime() <= new Date(state.to).getTime();

const coaches = (team: Team) => team.my_role !== 'archer';

/**
 * The teams in which you may write notes about `archer`, as `GET /api/notes/teams/` gives them: teams you coach where the
 * person is an archer, or a coach who shares their training. From the copy, for when the server cannot be reached.
 */
export const noteTeams = (state: ScheduleCache, archer: number): { id: number; name: string }[] =>
  state.teams
    .filter((team) => coaches(team) && (state.members[String(team.id)] ?? []).some((m) => m.user_id === archer && (m.role === 'archer' || m.also_shoots)))
    .map((team) => ({ id: team.id, name: team.name }))
    .sort((a, b) => a.name.localeCompare(b.name));

const slim = ({ user_id, name, role, also_shoots, managed }: Member): CachedMember => ({ user_id, name, role, also_shoots, managed });

/** Teams, then the agenda of all of them in one request, then the members of the teams you coach. Null if any of it failed: the copy stays as it is. */
export async function pullSchedule(api: ApiClient, at: Date): Promise<SchedulePull | null> {
  try {
    const teams = (await api.GET('/api/teams/')).data;
    if (!teams) return null;
    const window = windowAt(at);
    const agenda = (await api.GET('/api/events/agenda/', { params: { query: window } })).data;
    if (!agenda) return null;
    const members: Record<string, CachedMember[]> = {};
    for (const team of teams.filter(coaches)) {
      const list = (await api.GET('/api/teams/{team_id}/members/', { params: { path: { team_id: team.id } } })).data;
      if (!list) return null;
      members[String(team.id)] = list.map(slim);
    }
    return { teams, members, agenda, ...window };
  } catch {
    return null;
  }
}
