import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { score, type ScoringFace } from './scoring.ts';

const read = (name: string) => JSON.parse(readFileSync(new URL(`../../shared/${name}`, import.meta.url), 'utf-8'));
const faces: Record<string, ScoringFace> = Object.fromEntries(
  read('target-faces.json').faces.map((f: ScoringFace & { slug: string }) => [f.slug, f]),
);

type Vector = {
  face: string;
  x: number;
  y: number;
  expect: { value: number | null; is_x: boolean; is_miss: boolean };
  why: string;
};

for (const v of read('scoring-vectors.json').vectors as Vector[]) {
  test(`${v.face} (${v.x.toFixed(4)}, ${v.y.toFixed(4)}) ${v.why}`, () => {
    assert.deepEqual(score(faces[v.face], v.x, v.y), v.expect);
  });
}
