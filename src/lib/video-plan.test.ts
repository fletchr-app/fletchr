import assert from 'node:assert/strict';
import { test } from 'vitest';

import { planConversion, type VideoInfo, VIDEO_LIMITS } from './video-plan.ts';

// The clip of the prototype: 120 fps slow motion, stored on a timeline stretched about four times.
const slowMotion: VideoInfo = { width: 1920, height: 1080, durationMs: 29_000, frames: 872, fileFps: 30.07, captureFps: 120 };
const normal: VideoInfo = { width: 1920, height: 1080, durationMs: 10_000, frames: 300, fileFps: 30, captureFps: 0 };

function plan(info: VideoInfo, limits = VIDEO_LIMITS) {
  const p = planConversion(info, limits);
  assert.ok(p.ok, JSON.stringify(p));
  return p;
}

test('a slow-motion clip goes onto its real timeline', () => {
  const p = plan(slowMotion);
  assert.ok(Math.abs(p.speed - 120 / 30.07) < 1e-9);
  assert.ok(Math.abs(p.fps - 120) < 1e-9);
  assert.ok(Math.abs(p.realDurationMs - 7_267) < 5, `${p.realDurationMs}`);
});

test('a normal clip keeps its timeline', () => {
  const p = plan(normal);
  assert.equal(p.speed, 1);
  assert.equal(p.fps, 30);
  assert.equal(p.realDurationMs, 10_000);
});

test('a capture rate near the file rate is not slow motion', () => {
  assert.equal(plan({ ...normal, captureFps: 30 }).speed, 1);
  assert.equal(plan({ ...normal, captureFps: 44 }).speed, 1);
  assert.ok(plan({ ...normal, captureFps: 60 }).speed > 1);
});

test('the keyframe interval is counted with the frame rate of the source file', () => {
  assert.ok(Math.abs(plan(normal).keyframeSeconds - 10 / 30) < 1e-9);
  assert.ok(Math.abs(plan(slowMotion).keyframeSeconds - 10 / 30.07) < 1e-9, 'not 10 / 120');
});

test('the short side is 720, in either orientation, and nothing is enlarged', () => {
  assert.deepEqual([plan(normal).width, plan(normal).height], [1280, 720]);
  const portrait = plan({ ...normal, width: 1080, height: 1920 });
  assert.deepEqual([portrait.width, portrait.height], [720, 1280]);
  const small = plan({ ...normal, width: 640, height: 480 });
  assert.deepEqual([small.width, small.height], [640, 480]);
  const odd = plan({ ...normal, width: 1000, height: 563 });
  assert.equal(odd.height % 2, 0);
  assert.equal(odd.width % 2, 0);
});

test('the bitrate asked of the encoder is the wanted one divided by the speed', () => {
  const n = plan(normal);
  assert.equal(n.bitrate, Math.round(0.08 * 1280 * 720 * 30));
  const s = plan(slowMotion);
  // wanted on the real timeline: 0.08 * 1280 * 720 * 120 = 8.85 Mbit/s; the encoder is asked for a quarter of it
  assert.ok(Math.abs(s.bitrate * s.speed - 0.08 * 1280 * 720 * 120) < 100, `${s.bitrate}`);
});

test('a long clip gets a lower bitrate so that it stays under the size limit', () => {
  const long = plan({ ...slowMotion, durationMs: 235_000, frames: 7050 }); // about 59 s of real time
  const bytes = (long.bitrate * long.speed * (long.realDurationMs / 1000)) / 8;
  assert.ok(bytes <= VIDEO_LIMITS.maxBytes * 0.81, `${bytes}`);
  assert.ok(bytes > VIDEO_LIMITS.maxBytes * 0.7, 'but not lower than it has to be');
});

test('a clip longer than the limit is refused, by its real length', () => {
  const p = planConversion({ ...normal, durationMs: 75_000, frames: 2250 });
  assert.deepEqual(p, { ok: false, reason: 'tooLong', seconds: 75, maxSeconds: 60 });
  // a slow-motion clip counts by real time: 4 minutes on the stretched timeline is 60 s
  assert.ok(planConversion({ ...slowMotion, durationMs: 239_000, frames: 7200 }).ok);
  assert.equal(planConversion({ ...slowMotion, durationMs: 245_000, frames: 7300 }).ok, false);
  assert.ok(planConversion({ ...normal, durationMs: 60_000, frames: 1800 }).ok, 'exactly the limit is fine');
});

test('a file without readable properties is unreadable', () => {
  assert.deepEqual(planConversion({ ...normal, width: 0 }), { ok: false, reason: 'unreadable' });
  assert.deepEqual(planConversion({ ...normal, durationMs: 0 }), { ok: false, reason: 'unreadable' });
});

test('a missing frame rate is worked out from the frame count, or taken as 30', () => {
  assert.ok(Math.abs(plan({ ...normal, fileFps: 0, frames: 250 }).fps - 25) < 1e-9);
  assert.equal(plan({ ...normal, fileFps: 0, frames: 0 }).fps, 30);
});
