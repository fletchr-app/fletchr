import assert from 'node:assert/strict';
import { test } from 'vitest';

import { currentGoals, progress, type Evaluated } from './progress.ts';

const c = (key: string, group = 'Stance') => ({ key, label: key.toUpperCase(), group });
const ev = (id: number, date: string, scores: [string, number][], more: Partial<Evaluated> = {}): Evaluated => ({
  id,
  date,
  created_at: `${date}T10:00:00Z`,
  kind: 'coach',
  criteria: [c('a'), c('b'), c('x', 'Release')],
  scores: scores.map(([criterion, rating]) => ({ criterion, rating })),
  ...more,
});

test('a group is the mean of its rated criteria, per evaluation, oldest first', () => {
  const [stance, release] = progress([ev(2, '2026-02-01', [['a', 4], ['b', 5], ['x', 2]]), ev(1, '2026-01-01', [['a', 2], ['b', 3]])]);
  assert.equal(stance!.group, 'Stance');
  assert.deepEqual(stance!.coach, [{ date: '2026-01-01', value: 2.5 }, { date: '2026-02-01', value: 4.5 }]);
  assert.deepEqual(release!.coach, [{ date: '2026-02-01', value: 2 }]);
});

test('coach and self ratings are separate lines', () => {
  const [stance] = progress([ev(1, '2026-01-01', [['a', 4]]), ev(2, '2026-01-05', [['a', 2]], { kind: 'self' })]);
  assert.deepEqual(stance!.coach.map((p) => p.value), [4]);
  assert.deepEqual(stance!.self.map((p) => p.value), [2]);
});

test('a criterion shows the latest rating and the change since the one before', () => {
  const [stance] = progress([ev(1, '2026-01-01', [['a', 2]]), ev(2, '2026-02-01', [['a', 5]]), ev(3, '2026-03-01', [['b', 1]])]);
  const a = stance!.criteria.find((x) => x.key === 'a')!;
  assert.deepEqual([a.coach.latest, a.coach.change], [5, 3]);
  assert.deepEqual([a.self.latest, a.self.change], [null, null]);
  const b = stance!.criteria.find((x) => x.key === 'b')!;
  assert.deepEqual([b.coach.latest, b.coach.change], [1, null]);
});

test('a renamed criterion keeps its history and takes the newest label', () => {
  const old = ev(1, '2026-01-01', [['a', 2]], { criteria: [{ key: 'a', label: 'Old', group: 'Stance' }] });
  const next = ev(2, '2026-02-01', [['a', 3]], { criteria: [{ key: 'a', label: 'New', group: 'Stance' }] });
  const [stance] = progress([old, next]);
  assert.deepEqual(stance!.criteria.map((x) => [x.label, x.coach.latest, x.coach.change]), [['New', 3, 1]]);
});

test('nothing rated gives no points', () => {
  assert.deepEqual(progress([]), []);
});

test('the goals are those of the newest evaluation of each kind, only while it has some', () => {
  const list = [
    ev(1, '2026-01-01', [], { goals: 'old goal' }),
    ev(2, '2026-02-01', [], { goals: 'Hold the draw' }),
    ev(3, '2026-02-05', [], { kind: 'self', goals: '  ' }),
    ev(4, '2026-02-09', [], { kind: 'self', goals: 'Relax' }),
  ];
  assert.deepEqual(currentGoals(list).map((g) => [g.kind, g.evaluation.goals]), [['coach', 'Hold the draw'], ['self', 'Relax']]);
  assert.deepEqual(currentGoals([...list, ev(5, '2026-03-01', [], { goals: '' })]).map((g) => g.kind), ['self']);
});
