import assert from 'node:assert/strict';
import { test } from 'vitest';

import { clock, frameAt, frameRate, nextSpeed, scrubbed, seekTime, speedLabel, stepped, totalFrames } from './player.ts';

test('the frame rate comes from count and length when the server has both', () => {
  assert.equal(frameRate({ frame_count: 240, duration_ms: 2000, capture_fps: 120 }), 120);
  assert.ok(Math.abs(frameRate({ frame_count: 299, duration_ms: 10_000, capture_fps: 30 }) - 29.9) < 1e-9);
});

test('without them the label is used, and without that 30', () => {
  assert.equal(frameRate({ capture_fps: 60 }), 60);
  assert.equal(frameRate({ capture_fps: null }), 30);
  assert.equal(frameRate({ capture_fps: 0, frame_count: 1, duration_ms: 0 }), 30);
});

test('a clip has at least one frame', () => {
  assert.equal(totalFrames(2, 120), 240);
  assert.equal(totalFrames(0, 30), 1);
});

test('seeking lands in the middle of a frame, and that time shows the same frame', () => {
  for (const fps of [24, 30, 59.94, 120]) {
    for (const frame of [0, 1, 7, 100]) {
      const total = 1000;
      assert.equal(frameAt(seekTime(frame, fps, 60), fps, total), frame, `${fps} fps, frame ${frame}`);
    }
  }
});

test('the last frame stays inside the clip', () => {
  assert.ok(seekTime(239, 120, 2) < 2);
  assert.equal(frameAt(2, 120, 240), 239);
  assert.equal(frameAt(-1, 120, 240), 0);
});

test('dragging the tape left goes forward, and it stops at both ends', () => {
  assert.equal(scrubbed(10, -24, 12, 100), 12);
  assert.equal(scrubbed(10, 24, 12, 100), 8);
  assert.equal(scrubbed(2, 240, 12, 100), 0);
  assert.equal(scrubbed(98, -240, 12, 100), 99);
});

test('a step moves one frame from where the tape rests', () => {
  assert.equal(stepped(10.4, 1, 100), 11);
  assert.equal(stepped(0, -1, 100), 0);
  assert.equal(stepped(99, 1, 100), 99);
});

test('the clock shows milliseconds', () => {
  assert.equal(clock(21.2044), '21.204');
  assert.equal(clock(0), '0.000');
  assert.equal(clock(-0.5), '0.000');
});

test('the speed goes round', () => {
  assert.equal(nextSpeed(1), 0.5);
  assert.equal(nextSpeed(0.1), 1);
  assert.equal(nextSpeed(3), 1, 'an unknown speed starts the row again');
  assert.equal(speedLabel(0.25), '0.25x');
});
