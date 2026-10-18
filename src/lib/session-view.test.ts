import assert from 'node:assert/strict';
import { test } from 'vitest';

import type { components } from './api-types.ts';
import type { LogEnd } from './log-model.ts';
import { blocksOf, fromServer } from './session-view.ts';

const shot = (id: string, extra: object = {}) => ({ id, value: 9, is_x: false, is_miss: false, ...extra });
const end = (id: string, index: number, distance_m: string, face: string, shots: LogEnd['shots']): LogEnd => ({
  id, index, distance_m, face, arrows_per_end: 3, shots,
});

test('ends at the same distance and face share a block, others get their own', () => {
  const blocks = blocksOf({
    ends: [
      end('1', 0, '18.0', 'wa-40', []),
      end('2', 1, '30.0', 'wa-40', []),
      end('3', 2, '18', 'wa-40', []), // "18" and "18.0" are the same distance
      end('4', 3, '18.0', 'wa-122', []),
    ],
  });
  assert.deepEqual(blocks.map((b) => b.ends.map((e) => e.id)), [['1', '3'], ['2'], ['4']]);
});

test('arrows with a position are drawn, typed ones are only counted', () => {
  const [block] = blocksOf({
    ends: [end('1', 0, '18.0', 'wa-40', [shot('a', { x: 0.1, y: 0.1, spot: 0 }), shot('b'), shot('c', { x: -0.1, y: 0, spot: 0 })])],
  });
  assert.equal(block.plotted.length, 2);
  assert.equal(block.typed, 1);
});

test('groups are per spot, over all ends of the block', () => {
  const [block] = blocksOf({
    ends: [
      end('1', 0, '18.0', 'wa-40-triple-vertical', [shot('a', { x: 0.2, y: 0, spot: 0 }), shot('b', { x: 0, y: 0.2, spot: 2 })]),
      end('2', 1, '18.0', 'wa-40-triple-vertical', [shot('c', { x: 0, y: 0, spot: 0 }), shot('d', { x: 0.1, y: 0.1, spot: 2 })]),
    ],
  });
  assert.deepEqual(block.groups.map((g) => [g.spot, g.group.n]), [[0, 2], [2, 2]]);
  assert.equal(block.groups[0].group.cx, 0.1);
});

test('a block without positions has no groups', () => {
  const [block] = blocksOf({ ends: [end('1', 0, '18.0', 'wa-40', [shot('a')])] });
  assert.deepEqual(block.groups, []);
});

test('server sessions become the same shape as local ones, with missing positions left out', () => {
  const server = {
    id: 's', owner: 1, owner_name: 'Anna', started_at: '2026-10-18T09:00:00Z', ended_at: null, type: 'scoring', environment: 'indoor',
    location: 'Hall', updated_at: '2026-10-18T09:05:00Z',
    ends: [{
      id: 'e', index: 0, distance_m: '18.0', face: 'wa-40', arrows_per_end: 3,
      shots: [
        { id: 'p', x: 0.1, y: -0.2, spot: 1, value: 10, is_x: false, is_miss: false, is_manual: false },
        { id: 't', x: null, y: null, spot: 0, value: 9, is_x: false, is_miss: false, is_manual: true },
        { id: 'm', x: null, y: null, spot: 0, value: null, is_x: false, is_miss: true, is_manual: true },
      ],
    }],
    volume_entries: [{ id: 'v', distance_m: '30.0', arrow_count: 12 }],
  } as unknown as components['schemas']['Session'];
  const view = fromServer(server);
  assert.equal(view.owner_name, 'Anna');
  assert.deepEqual(view.ends[0].shots[0], { id: 'p', value: 10, is_x: false, is_miss: false, x: 0.1, y: -0.2, spot: 1 });
  assert.deepEqual(view.ends[0].shots[1], { id: 't', value: 9, is_x: false, is_miss: false });
  assert.equal(view.ends[0].shots[2].is_miss, true);
  assert.deepEqual(view.volume, [{ id: 'v', distance_m: '30.0', arrow_count: 12 }]);
});

test('the equipment of a server session is shown with its revision numbers', () => {
  const base = { id: 's', owner: 1, owner_name: 'A', started_at: 'x', ended_at: null, type: 'scoring', ends: [], volume_entries: [], updated_at: 'x' };
  const withGear = fromServer({
    ...base,
    setup_info: { bow_name: 'Hoyt', bow_type: 'recurve', bow_revision: 11, bow_revision_number: 2, arrow_set_name: 'X10', arrow_set_revision: 21, arrow_set_revision_number: 3 },
  } as unknown as components['schemas']['Session']);
  assert.equal(withGear.gear?.bow_label, 'Hoyt (r2)');
  assert.equal(withGear.gear?.arrow_label, 'X10 (r3)');
  const bowOnly = fromServer({
    ...base,
    setup_info: { bow_name: 'Hoyt', bow_type: 'recurve', bow_revision: 11, bow_revision_number: 2, arrow_set_name: null, arrow_set_revision: null, arrow_set_revision_number: null },
  } as unknown as components['schemas']['Session']);
  assert.equal(bowOnly.gear?.arrow_label, '');
  assert.equal(fromServer({ ...base, setup_info: null } as unknown as components['schemas']['Session']).gear, null);
});
