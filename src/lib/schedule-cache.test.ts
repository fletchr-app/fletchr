import assert from 'node:assert/strict';
import createClient from 'openapi-fetch';
import { test } from 'vitest';

import type { components, paths } from './api-types.ts';
import type { AgendaItem } from './schedule.ts';
import { AHEAD_DAYS, BACK_DAYS, covers, EMPTY_SCHEDULE, itemsFor, noteTeams, pulled, pullSchedule, type ScheduleCache, windowAt } from './schedule-cache.ts';

type Team = components['schemas']['Team'];

const item = (id: string, start: string, end: string, extra: Partial<AgendaItem> = {}): AgendaItem => ({
  id, virtual: true, slot: 's', date: start.slice(0, 10), team: 1, team_name: 'Team A', kind: 'training', name: '', start, end, location: '', time_zone: 'Europe/Berlin', cancelled: false, ...extra,
});
const team = (id: number, my_role = 'coach'): Team => ({ id, name: `Team ${id}`, my_role, also_shoots: false });
const at = new Date('2026-11-05T10:00:00Z');
const window = windowAt(at);
const tuesday = item('a', '2026-11-03T17:00:00Z', '2026-11-03T18:30:00Z');
const other = item('b', '2026-11-04T17:00:00Z', '2026-11-04T18:30:00Z', { team: 2, team_name: 'Team B' });

const state = (extra: Partial<Pick<ScheduleCache, 'teams' | 'members' | 'agenda'>> = {}): ScheduleCache =>
  pulled({ teams: [team(1), team(2, 'archer')], members: {}, agenda: [tuesday, other], ...window, ...extra }, at);

test('a pull replaces the copy: a training gone elsewhere and the trainings of a team you left are gone', () => {
  const before = state();
  const after = pulled({ teams: [team(1)], members: {}, agenda: [], ...window }, new Date('2026-11-06T10:00:00Z'));
  assert.deepEqual(before.agenda.map((i) => i.id), ['a', 'b']);
  assert.deepEqual(after.agenda, []);
  assert.deepEqual(after.teams.map((t) => t.id), [1]);
  assert.equal(after.pulledAt, '2026-11-06T10:00:00.000Z');
});

test('the window covers a month of backdating and the agenda list, and stays under the server limit of 120 days', () => {
  const days = (Date.parse(window.to) - Date.parse(window.from)) / 86_400_000;
  assert.equal(days, BACK_DAYS + AHEAD_DAYS);
  assert.ok(days <= 120);
  assert.ok(BACK_DAYS >= 31 && AHEAD_DAYS >= 56);
});

test('items by team and range', () => {
  const s = state();
  assert.deepEqual(itemsFor(s, { from: '2026-11-01T00:00:00Z', to: '2026-11-08T00:00:00Z' }).map((i) => i.id), ['a', 'b']);
  assert.deepEqual(itemsFor(s, { team: 2, from: '2026-11-01T00:00:00Z', to: '2026-11-08T00:00:00Z' }).map((i) => i.id), ['b']);
  assert.deepEqual(itemsFor(s, { from: '2026-11-04T00:00:00Z', to: '2026-11-05T00:00:00Z' }).map((i) => i.id), ['b']);
  // A training that only touches the range is not in it.
  assert.deepEqual(itemsFor(s, { from: '2026-11-03T18:30:00Z', to: '2026-11-04T00:00:00Z' }), []);
});

test('covers says whether a range is on the phone', () => {
  const s = state();
  assert.equal(covers(s, '2026-11-01T00:00:00Z', '2026-12-01T00:00:00Z'), true);
  assert.equal(covers(s, '2026-09-01T00:00:00Z', '2026-10-01T00:00:00Z'), false);
  assert.equal(covers(s, '2027-02-01T00:00:00Z', '2027-03-01T00:00:00Z'), false);
  assert.equal(covers(EMPTY_SCHEDULE, '2026-11-01T00:00:00Z', '2026-11-02T00:00:00Z'), false);
});

test('the teams to write notes in come from the coached teams where the person shoots', () => {
  const s = state({
    teams: [team(1), team(2, 'archer'), team(3, 'admin')],
    members: {
      '1': [{ user_id: 7, name: 'Ann', role: 'archer', also_shoots: false, managed: false }, { user_id: 8, name: 'Ben', role: 'coach', also_shoots: false, managed: false }],
      '2': [{ user_id: 7, name: 'Ann', role: 'archer', also_shoots: false, managed: false }],
      '3': [{ user_id: 8, name: 'Ben', role: 'coach', also_shoots: true, managed: false }],
    },
  });
  assert.deepEqual(noteTeams(s, 7), [{ id: 1, name: 'Team 1' }]); // not team 2: there you are an archer
  assert.deepEqual(noteTeams(s, 8), [{ id: 3, name: 'Team 3' }]); // a coach who shares their training
  assert.deepEqual(noteTeams(s, 99), []);
});

const json = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function client(handler: (path: string, query: URLSearchParams) => Response) {
  const paths: string[] = [];
  const api = createClient<paths>({
    baseUrl: 'http://server',
    fetch: async (request: Request) => {
      const url = new URL(request.url);
      paths.push(url.pathname);
      return handler(url.pathname, url.searchParams);
    },
  });
  return { api, paths };
}

test('a pull asks for teams, the whole agenda in one request, and the members of the teams you coach only', async () => {
  let query: URLSearchParams | null = null;
  const { api, paths } = client((path, q) => {
    if (path === '/api/teams/') return json(200, [team(1), team(2, 'archer')]);
    if (path === '/api/events/agenda/') {
      query = q;
      return json(200, [tuesday]);
    }
    return json(200, [{ user_id: 7, name: 'Ann', email: 'ann@example.org', managed: false, role: 'archer', also_shoots: false, joined_at: 'x', avatar_url: 'http://pic' }]);
  });
  const result = await pullSchedule(api, at);
  assert.deepEqual(paths, ['/api/teams/', '/api/events/agenda/', '/api/teams/1/members/']);
  assert.equal(query!.get('team'), null);
  assert.equal(query!.get('from'), window.from);
  assert.deepEqual(result?.members, { '1': [{ user_id: 7, name: 'Ann', role: 'archer', also_shoots: false, managed: false }] }); // no address, no picture
});

test('a failed pull gives nothing, so the copy stays', async () => {
  for (const fail of ['/api/teams/', '/api/events/agenda/', '/api/teams/1/members/']) {
    const { api } = client((path) => (path === fail ? json(503) : path === '/api/teams/' ? json(200, [team(1)]) : json(200, [])));
    assert.equal(await pullSchedule(api, at), null, fail);
  }
  const { api } = client(() => {
    throw new TypeError('offline');
  });
  assert.equal(await pullSchedule(api, at), null);
});
