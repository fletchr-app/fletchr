import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'vitest';

import type { LogSession } from './log-model.ts';
import { pyRound, pySum } from './py-math.ts';
import {
  computeArrowStats,
  computeStats,
  fromLog,
  localDay,
  positionsOf,
  type PositionsQuery,
  quantizeDistance,
  type StatsSession,
  weekStart,
} from './stats.ts';

type Case = {
  name: string;
  now: string;
  tz: string;
  weeks: number;
  sessions: StatsSession[];
  stats: unknown;
  arrow_stats: unknown;
  positions?: { query: PositionsQuery; expect: unknown }[];
};
const cases = (JSON.parse(readFileSync(new URL('../../shared/stats-vectors.json', import.meta.url), 'utf-8')) as { cases: Case[] }).cases;

// The same file is read by server/training/tests/test_stats_vectors.py.
for (const c of cases) {
  test(`statistics: ${c.name}`, () => {
    assert.deepEqual(computeStats(c.sessions, c.now, c.tz, c.weeks), c.stats);
  });
  test(`numbered arrows: ${c.name}`, () => {
    assert.deepEqual(computeArrowStats(c.sessions), c.arrow_stats);
  });
  for (const p of c.positions ?? []) {
    test(`heatmap positions: ${c.name} ${JSON.stringify(p.query)}`, () => {
      assert.deepEqual(positionsOf(c.sessions, p.query), p.expect);
    });
  }
}

test('Python rounding: an exact tie goes to the even digit, everything else to the nearest', () => {
  assert.equal(pyRound(8.0625, 3), 8.062);
  assert.equal(pyRound(0.03125, 4), 0.0312);
  assert.equal(pyRound(0.25, 1), 0.2);
  assert.equal(pyRound(0.75, 1), 0.8);
  assert.equal(pyRound(2.675, 2), 2.67); // not a tie: the double is a little below 2.675
  assert.equal(pyRound(1.0005, 3), 1); // the double is 1.000499999...
  assert.equal(pyRound(-8.0625, 3), -8.062);
  assert.equal(pyRound(0.0001, 4), 0.0001);
  assert.equal(pyRound(0, 4), 0);
});

test('Python sum: the error term decides a result that is nearly zero', () => {
  assert.equal(0.1 + 0.2 + -0.3, 5.551115123125783e-17); // a plain loop
  assert.equal(pySum([0.1, 0.2, -0.3]), 2.7755575615628914e-17); // what Python 3.12 and later gives for sum([0.1, 0.2, -0.3])
  assert.equal(pySum([1e100, 1, -1e100]), 1); // a plain loop gives 0
  assert.equal(pySum([]), 0);
});

test('distances are grouped by one decimal like the server does', () => {
  assert.equal(quantizeDistance('18'), '18.0');
  assert.equal(quantizeDistance('18.00'), '18.0');
  assert.equal(quantizeDistance('22.25'), '22.2'); // Decimal.quantize rounds half to even
});

test('days and weeks follow the time zone and start on Monday', () => {
  assert.equal(localDay('2026-10-25T22:30:00Z', 'Europe/Berlin'), '2026-10-25');
  assert.equal(localDay('2026-10-25T23:30:00Z', 'Europe/Berlin'), '2026-10-26');
  assert.equal(weekStart('2026-10-25'), '2026-10-19'); // a Sunday
  assert.equal(weekStart('2026-10-26'), '2026-10-26');
  assert.equal(weekStart('2026-01-01'), '2025-12-29');
});

test('the heatmap is capped at the newest positions', () => {
  const [c] = cases.filter((x) => x.positions);
  const result = positionsOf(c!.sessions, { face: 'wa-40', distance_m: '18', tz: 'UTC' }, 2)!;
  assert.equal(result.arrows, 6);
  assert.equal(result.limited, true);
  assert.deepEqual(result.points, [[-0.5, -0.5], [0.4, 0]]);
});

test('an unknown face or a blank one has no heatmap', () => {
  assert.equal(positionsOf([], { face: 'nope', distance_m: '18', tz: 'UTC' }), null);
  assert.equal(positionsOf([], { face: 'blank', distance_m: '18', tz: 'UTC' }), null);
});

const gear = { bow_id: null, bow_revision: null, bow_label: 'Hoyt (r2)', arrow_set_id: null, arrow_set_revision: null, arrow_label: 'Easton (r1)' };
const logged = (id: string, startedAt: string, extra: Partial<LogSession>): LogSession => ({
  id, started_at: startedAt, ended_at: null, type: 'scoring', environment: '', location: '', ends: [], volume: [], ...extra,
});

test('sessions on the device become statistics input: scored again from the position, setups numbered, labels kept', () => {
  const { sessions, setupLabels } = fromLog([
    logged('s2', '2026-10-21T10:00:00Z', {
      gear: { ...gear, bow_revision_uid: 'rev-b', arrow_set_revision_uid: 'rev-a', arrow_set_key: 'set-1' },
      details: { weather: '', physical_rating: 4, mental_rating: null, goals: '', notes: '' },
      ends: [{ id: 'e', index: 0, distance_m: '18', face: 'wa-40', arrows_per_end: 3, shots: [
        // stored as a 9, but the position is a 10: the server would say 10 after the upload
        { id: 'a', value: 9, is_x: false, is_miss: false, x: 0.05, y: 0, spot: 0, arrow_number: 3 },
        { id: 'b', value: 7, is_x: false, is_miss: false },
      ] }],
    }),
    logged('s1', '2026-10-20T10:00:00Z', { gear: { ...gear, bow_revision_uid: 'rev-b', arrow_set_revision_uid: 'rev-a', arrow_set_key: 'set-1' } }),
    logged('coach', '2026-10-19T10:00:00Z', { owner: 7 }),
  ]);
  assert.deepEqual(sessions.map((s) => s.id), ['s1', 's2'], 'oldest first, the archer a coach logs for is not mine');
  assert.equal(sessions[0]!.setup, 1);
  assert.equal(sessions[1]!.setup, 1);
  assert.deepEqual(setupLabels, { 1: 'Hoyt (r2) · Easton (r1)' });
  assert.deepEqual(sessions[1]!.arrow_set, { id: 1, name: 'Easton' });
  assert.equal(sessions[1]!.physical_rating, 4);
  assert.deepEqual(sessions[1]!.ends[0]!.shots.map((s) => [s.value, s.x ?? null, s.arrow_number]), [[10, 0.05, 3], [7, null, null]]);
});

test('a session without equipment has no setup', () => {
  assert.equal(fromLog([logged('s', '2026-10-20T10:00:00Z', {})]).sessions[0]!.setup, null);
});
