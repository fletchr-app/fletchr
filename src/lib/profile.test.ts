import { describe, expect, it } from 'vitest';

import { BOW_FIELDS } from './equipment-fields.ts';
import { ageOn, currentGear, gearSummary, latestTiles, sectionLinks } from './profile.ts';

describe('currentGear', () => {
  it('takes the first active item of the device shape', () => {
    const bows = [
      { is_active: false, values: { name: 'Old' } },
      { is_active: true, values: { name: 'Shibuya', draw_weight: 38 } },
    ];
    expect(currentGear(bows, []).bow?.name).toBe('Shibuya');
    expect(currentGear(bows, []).arrows).toBeUndefined();
  });

  it('takes the server shape with the values at the top level', () => {
    const arrows = [{ name: 'X10', is_active: true, spine: 500 }];
    expect(currentGear([], arrows).arrows).toEqual({ name: 'X10', values: arrows[0] });
  });

  it('counts an item without the flag as active', () => {
    expect(currentGear([{ name: 'A' }], []).bow?.name).toBe('A');
  });
});

describe('gearSummary', () => {
  const choice = (_key: string, value: string) => value.toUpperCase();
  it('joins the filled values with their units', () => {
    const bow = { name: 'B', values: { type: 'recurve', draw_weight: 38, sight: '' } };
    expect(gearSummary(bow, BOW_FIELDS, ['type', 'draw_weight', 'sight'], choice)).toBe('RECURVE · 38 lb');
  });
});

describe('latestTiles', () => {
  const m = (id: string, taken_at: string, kind: 'photo' | 'video' = 'photo') => ({ id, kind, taken_at });
  const src = (id: string) => `src:${id}`;

  it('puts the queue first, then the library newest first, each once', () => {
    const tiles = latestTiles([m('q1', '2026-01-01')], [m('a', '2026-03-01'), m('q1', '2026-01-01'), m('b', '2026-02-01')], src, false, 6);
    expect(tiles.map((t) => t.id)).toEqual(['q1', 'a', 'b']);
    expect(tiles[0]?.queued).toBe(true);
  });

  it('stops at n', () => {
    expect(latestTiles([], [m('a', '3'), m('b', '2'), m('c', '1')], src, false, 2).map((t) => t.id)).toEqual(['a', 'b']);
  });

  it('opens a queued item on the device without an account, a queued clip in its player, a photo on the media page', () => {
    const queue = [m('p', '2'), m('v', '1', 'video')];
    expect(latestTiles(queue, [], src, true, 6).map((t) => t.to)).toEqual(['/local-media/p', '/local-media/v']);
    expect(latestTiles(queue, [], src, false, 6).map((t) => t.to)).toEqual(['/media', '/media/v']);
    expect(latestTiles([], [m('x', '1')], src, false, 6)[0]?.to).toBe('/media/x');
  });
});

describe('sectionLinks', () => {
  const counts = { sessions: 3, evaluations: 2, tiles: 4, notes: 1, gear: true, arrows: 100 };
  const base = { own: true, isLocal: false, canEvaluate: false, canNote: false, counts };

  it('gives yourself a plus on equipment and evaluations, no plus on coach notes', () => {
    const l = sectionLinks(base);
    expect(l).toMatchObject({ gearPlus: true, evaluationsPlus: true, notesPlus: false, notesArrow: true, trainingArrow: true });
  });

  it('hides what needs an account without one', () => {
    const l = sectionLinks({ ...base, isLocal: true });
    expect(l).toMatchObject({ evaluationsPlus: false, evaluationsArrow: false, notesArrow: false, gearPlus: true, photosArrow: true });
  });

  it('gives a coach the plus only with the right to add', () => {
    expect(sectionLinks({ ...base, own: false })).toMatchObject({ gearPlus: false, evaluationsPlus: false, notesPlus: false });
    expect(sectionLinks({ ...base, own: false, canEvaluate: true, canNote: true })).toMatchObject({ evaluationsPlus: true, notesPlus: true });
  });

  it('shows no arrow for an empty section', () => {
    const l = sectionLinks({ ...base, counts: { sessions: 1, evaluations: 0, tiles: 0, notes: 0, gear: false, arrows: 0 } });
    expect(l).toMatchObject({ trainingArrow: false, evaluationsArrow: false, photosArrow: false, notesArrow: false, gearArrow: false, statsArrow: false });
  });
});

describe('ageOn', () => {
  it('counts whole years', () => {
    expect(ageOn('2000-06-15', new Date(2026, 5, 14))).toBe(25);
    expect(ageOn('2000-06-15', new Date(2026, 5, 15))).toBe(26);
    expect(ageOn(null, new Date())).toBeNull();
  });
});
