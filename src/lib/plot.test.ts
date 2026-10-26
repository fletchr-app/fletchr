import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'vitest';

import { fitScale, nearestShot, pickAt, ringFill, ringLine, sceneOf, toPixel, type PlotFace } from './plot.ts';
import { score } from './scoring.ts';

const faces: Record<string, PlotFace & { slug: string }> = Object.fromEntries(
  JSON.parse(readFileSync(new URL('../../shared/target-faces.json', import.meta.url), 'utf-8')).faces.map((f: PlotFace & { slug: string }) => [f.slug, f]),
);
const near = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test('a single face is a square around the face with a margin', () => {
  const scene = sceneOf(faces['wa-40']);
  near(scene.radius, 20);
  near(scene.width, 43);
  near(scene.height, 43);
  near(scene.x0, -21.5);
});

test('a vertical triple is tall, a triangle is roughly square', () => {
  const vertical = sceneOf(faces['wa-40-triple-vertical']);
  assert.ok(vertical.height > 2 * vertical.width);
  const triangle = sceneOf(faces['wa-40-triple-triangle']);
  assert.ok(triangle.width > 30 && triangle.height > 30);
});

test('the scale fits the scene into the box in both directions', () => {
  const scene = sceneOf(faces['wa-40-triple-vertical']);
  const scale = fitScale(scene, 600, 400);
  assert.ok(scene.width * scale <= 600 + 1e-9 && scene.height * scale <= 400 + 1e-9);
  near(scene.height * scale, 400);
});

test('touching the middle of a single face is the centre', () => {
  const face = faces['wa-122'];
  const scene = sceneOf(face);
  const scale = fitScale(scene, 400, 400);
  const pick = pickAt(face, scene, scale, (scene.width * scale) / 2, (scene.height * scale) / 2);
  assert.equal(pick.spot, 0);
  near(pick.x, 0);
  near(pick.y, 0);
});

test('up on the screen is positive y, right is positive x', () => {
  const face = faces['wa-40'];
  const scene = sceneOf(face);
  const scale = 10;
  const cx = (scene.width * scale) / 2;
  const cy = (scene.height * scale) / 2;
  const up = pickAt(face, scene, scale, cx, cy - 5 * scale); // 5 cm above the centre
  near(up.y, 5 / 20);
  near(up.x, 0);
  const right = pickAt(face, scene, scale, cx + 4 * scale, cy);
  near(right.x, 4 / 20);
});

test('a touch picks the nearest spot and is measured from its centre', () => {
  const face = faces['wa-40-triple-vertical'];
  const scene = sceneOf(face);
  const scale = 8;
  for (const [i, spot] of face.spots.entries()) {
    const { px, py } = toPixel(face, scene, scale, { spot: i, x: 0.3, y: -0.2 });
    const pick = pickAt(face, scene, scale, px, py);
    assert.equal(pick.spot, i, `spot ${i} at ${spot.y} cm`);
    near(pick.x, 0.3);
    near(pick.y, -0.2);
  }
});

test('toPixel and pickAt are inverses on every face and spot', () => {
  for (const face of Object.values(faces).filter((f) => f.kind !== 'blank')) {
    const scene = sceneOf(face);
    const scale = fitScale(scene, 350, 380);
    face.spots.forEach((_, spot) => {
      // Inside the spot only: further out, another spot of a multi-spot face may be nearer.
      const points = face.spots.length === 1 ? [[0, 0], [0.5, -0.4], [-0.9, 0.1], [1.2, 0.2], [-2, 1.5]] : [[0, 0], [0.5, -0.4], [-0.9, 0.1]];
      for (const [x, y] of points) {
        const { px, py } = toPixel(face, scene, scale, { spot, x, y });
        const back = pickAt(face, scene, scale, px, py);
        assert.equal(back.spot, spot, `${face.slug} spot ${spot} (${x}, ${y})`);
        near(back.x, x, 1e-9);
        near(back.y, y, 1e-9);
      }
    });
  }
});

test('a touch far outside the face is clamped, and scores as a miss', () => {
  const face = faces['wa-40'];
  const scene = sceneOf(face);
  const pick = pickAt(face, scene, 10, 100000, 0);
  near(Math.hypot(pick.x, pick.y), 4.5);
  assert.equal(score(face, pick.x, pick.y).is_miss, true);
});

test('a touch on a ring boundary scores the higher ring, like the scoring vectors', () => {
  const face = faces['wa-40']; // the 10 ring ends 2 cm from the centre
  const scene = sceneOf(face);
  const scale = 10;
  const cx = (scene.width * scale) / 2;
  const cy = (scene.height * scale) / 2;
  const on = pickAt(face, scene, scale, cx + 2 * scale, cy);
  assert.equal(score(face, on.x, on.y).value, 10);
  const outside = pickAt(face, scene, scale, cx + 2.2 * scale, cy);
  assert.equal(score(face, outside.x, outside.y).value, 9);
});

test('nearestShot finds the closest arrow within reach, else -1', () => {
  const points = [{ px: 10, py: 10 }, { px: 30, py: 10 }, { px: 32, py: 12 }];
  assert.equal(nearestShot(points, 11, 10, 14), 0);
  assert.equal(nearestShot(points, 30.5, 10, 14), 1);
  assert.equal(nearestShot(points, 33, 12, 14), 2);
  assert.equal(nearestShot(points, 100, 100, 14), -1);
  assert.equal(nearestShot([], 0, 0, 14), -1);
});

test('colours: gold centre, dark rings get light lines', () => {
  assert.equal(ringFill({ kind: 'wa' }, 10), '#f5d037');
  assert.equal(ringFill({ kind: 'wa' }, 3), '#1c1c1c');
  assert.equal(ringFill({ kind: 'field' }, 6), '#f5d037');
  assert.equal(ringFill({ kind: 'field' }, 1), '#1c1c1c');
  assert.equal(ringLine('#1c1c1c'), '#e8e8e8');
  assert.equal(ringLine('#f5d037'), '#1c1c1c');
});
