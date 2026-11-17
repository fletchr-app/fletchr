import { strict as assert } from 'node:assert';
import { test } from 'vitest';

import { clampView, MAX_SCALE, panned, pinched, whole, zoomedAt } from './pinch.ts';

const size = { width: 400, height: 300 };

test('fingers moving apart magnify the picture around the point between them', () => {
  const view = pinched(whole(), [{ x: 150, y: 100 }, { x: 250, y: 100 }], [{ x: 100, y: 100 }, { x: 300, y: 100 }], size);
  assert.equal(view.scale, 2);
  // the point of the picture that was at x 200 is still at x 200 on the screen: 200 = x + 2 * 200
  assert.equal(view.x + view.scale * 200, 200);
  assert.equal(view.y + view.scale * 100, 100);
});

test('the same fingers moving together move the picture along', () => {
  const start = { scale: 2, x: -100, y: -50 };
  const view = pinched(start, [{ x: 100, y: 100 }, { x: 200, y: 100 }], [{ x: 130, y: 120 }, { x: 230, y: 120 }], size);
  assert.equal(view.scale, 2);
  assert.deepEqual([view.x, view.y], [-70, -30]);
});

test('the scale stays between 1 and the maximum', () => {
  const far = pinched(whole(), [{ x: 199, y: 100 }, { x: 201, y: 100 }], [{ x: 0, y: 100 }, { x: 400, y: 100 }], size);
  assert.equal(far.scale, MAX_SCALE);
  const together = pinched({ scale: 2, x: -100, y: -100 }, [{ x: 100, y: 100 }, { x: 300, y: 100 }], [{ x: 199, y: 100 }, { x: 201, y: 100 }], size);
  assert.deepEqual(together, whole());
});

test('the picture cannot be dragged off its box', () => {
  assert.deepEqual(panned({ scale: 2, x: 0, y: 0 }, 50, 50, size), { scale: 2, x: 0, y: 0 });
  assert.deepEqual(panned({ scale: 2, x: -100, y: -100 }, -500, -500, size), { scale: 2, x: -400, y: -300 });
  assert.deepEqual(panned({ scale: 2, x: -100, y: -100 }, 30, -20, size), { scale: 2, x: -70, y: -120 });
  assert.deepEqual(clampView({ scale: 1, x: 40, y: 40 }, size), whole());
});

test('fingers at the same place do not divide by zero', () => {
  const view = pinched({ scale: 2, x: -50, y: -50 }, [{ x: 10, y: 10 }, { x: 10, y: 10 }], [{ x: 20, y: 20 }, { x: 40, y: 40 }], size);
  assert.equal(view.scale, 2);
});

test('a double tap magnifies around the tap, and the tapped point stays under the finger', () => {
  const view = zoomedAt(whole(), { x: 100, y: 80 }, 3, size);
  assert.equal(view.scale, 3);
  assert.equal(view.x + 3 * 100, 100);
  assert.equal(view.y + 3 * 80, 80);
  assert.deepEqual(zoomedAt({ scale: 2, x: -100, y: -100 }, { x: 200, y: 150 }, 1, size), whole());
  // from a magnified view the tapped point is the one that was under the finger
  const again = zoomedAt({ scale: 2, x: -100, y: -100 }, { x: 200, y: 150 }, 4, size);
  assert.equal(again.x + 4 * ((200 + 100) / 2), 200);
});
