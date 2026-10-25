import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'vitest';

import { centredScore, MIN_ARROWS } from './centred.ts';
import type { ScoringFace } from './scoring.ts';

const read = (name: string) => JSON.parse(readFileSync(new URL(`../../shared/${name}`, import.meta.url), 'utf-8'));
const faces: Record<string, ScoringFace> = Object.fromEntries(read('target-faces.json').faces.map((f: ScoringFace & { slug: string }) => [f.slug, f]));

type Vector = {
  face: string;
  points: [number, number][];
  expect: { n: number; real: number; centred: number; centre: [number, number] } | null;
  why: string;
};

for (const v of read('centred-vectors.json').vectors as Vector[]) {
  test(`${v.face} ${v.why}`, () => {
    const result = centredScore(faces[v.face]!, v.points.map(([x, y]) => ({ x, y })));
    if (v.expect === null) return assert.equal(result, null);
    assert.ok(result);
    assert.deepEqual([result.n, result.real, result.centred], [v.expect.n, v.expect.real, v.expect.centred]);
    assert.ok(Math.abs(result.centreX - v.expect.centre[0]) < 1e-5 && Math.abs(result.centreY - v.expect.centre[1]) < 1e-5);
  });
}

test('the minimum is six arrows', () => {
  assert.equal(MIN_ARROWS, 6);
  assert.equal(centredScore(faces['wa-40']!, Array(5).fill({ x: 0.2, y: 0 })), null);
  assert.notEqual(centredScore(faces['wa-40']!, Array(6).fill({ x: 0.2, y: 0 })), null);
});
