import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'vitest';

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

// A face added to the catalogue without vectors must fail here, in the app and on the server alike.
test('the vectors cover every ring of every scored face, and a miss', () => {
  const vectors = read('scoring-vectors.json').vectors as Vector[];
  for (const [slug, face] of Object.entries(faces)) {
    const mine = vectors.filter((v) => v.face === slug);
    assert.ok(mine.length > 0, `no vectors for ${slug}`);
    if (face.rings.length === 0) continue;
    for (const ring of face.rings) assert.ok(mine.some((v) => v.expect.value === ring.value), `${slug}: no vector for ${ring.value}`);
    assert.ok(mine.some((v) => v.expect.is_miss), `${slug}: no vector for a miss`);
    if (face.x_diameter_cm) assert.ok(mine.some((v) => v.expect.is_x), `${slug}: no vector for an X`);
  }
});
