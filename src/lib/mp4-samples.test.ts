import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'vitest';

import { readMp4 } from './mp4-samples.ts';

function open(name: string) {
  const bytes = readFileSync(new URL(`./fixtures/${name}`, import.meta.url));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

test('a clip made by ffmpeg: 21 frames, a keyframe every 10, H.264', () => {
  const clip = readMp4(open('plain.mp4'))!;
  assert.equal(clip.samples.length, 21);
  assert.deepEqual(clip.keyframes, [0, 10, 20]);
  assert.match(clip.codec, /^avc1\.[0-9a-f]{6}$/);
  assert.equal(clip.width, 128);
  assert.equal(clip.height, 96);
  assert.equal(clip.description[0], 1, 'an avcC record starts with version 1');
  assert.deepEqual(clip.matrix, [1, 0, 0, 1]);
});

test('every frame lies inside the file, in order, and starts with the length of its first NAL unit', () => {
  const buffer = open('plain.mp4');
  const view = new DataView(buffer);
  const clip = readMp4(buffer)!;
  let end = 0;
  for (const s of clip.samples) {
    assert.ok(s.offset >= end, 'frames do not overlap');
    assert.ok(s.offset + s.size <= buffer.byteLength);
    assert.ok(view.getUint32(s.offset) <= s.size - 4, 'AVCC: a 4 byte length, then that many bytes');
    end = s.offset + s.size;
  }
});

test('it does not matter whether the moov box comes before or after the frames', () => {
  const first = readMp4(open('plain.mp4'))!;
  const last = readMp4(open('moov-last.mp4'))!;
  assert.equal(last.samples.length, first.samples.length);
  assert.deepEqual(last.keyframes, first.keyframes);
});

test('a clip that is turned says so (ffmpeg turns counter-clockwise: x becomes y, y becomes -x)', () => {
  assert.deepEqual(readMp4(open('portrait.mp4'))!.matrix, [0, -1, 1, 0]);
});

test('what the player cannot take apart gives null: B-frames, fragments, cut-off files, noise', () => {
  assert.equal(readMp4(open('bframes.mp4')), null);
  assert.equal(readMp4(open('fragmented.mp4')), null);
  assert.equal(readMp4(open('plain.mp4').slice(0, 2000)), null);
  assert.equal(readMp4(new Uint8Array(500).buffer), null);
  assert.equal(readMp4(new ArrayBuffer(0)), null);
});
