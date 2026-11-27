import assert from 'node:assert/strict';
import { test } from 'vitest';

import { WHATS_NEW } from '../locales/whats-new.ts';
import { entriesUpTo, unseenEntries, type WhatsNewEntry } from './whats-new.ts';

const entry = (version: string): WhatsNewEntry => ({ version, en: ['x'], de: ['x'] });
const all = [entry('0.29.0'), entry('0.31.0'), entry('0.30.0'), entry('0.32.0')];
const versions = (list: WhatsNewEntry[]) => list.map((e) => e.version);

test('a fresh install shows nothing', () => {
  assert.deepEqual(unseenEntries(all, null, '0.31.0', false), []);
});

test('an update from a version without the feature shows only the running version', () => {
  assert.deepEqual(versions(unseenEntries(all, null, '0.31.0', true)), ['0.31.0']);
});

test('skipped versions are all shown, newest first, nothing newer than the app', () => {
  assert.deepEqual(versions(unseenEntries(all, '0.28.0', '0.31.0', true)), ['0.31.0', '0.30.0', '0.29.0']);
});

test('nothing when the running version was seen already', () => {
  assert.deepEqual(unseenEntries(all, '0.31.0', '0.31.0', true), []);
});

test('the settings list has everything up to the running version', () => {
  assert.deepEqual(versions(entriesUpTo(all, '0.31.0')), ['0.31.0', '0.30.0', '0.29.0']);
});

test('every entry has a valid version and as many German as English points', () => {
  for (const e of WHATS_NEW) {
    assert.match(e.version, /^\d+\.\d+\.\d+$/);
    assert.ok(e.en.length > 0);
    assert.equal(e.de.length, e.en.length, e.version);
  }
});
