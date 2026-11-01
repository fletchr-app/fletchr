import assert from 'node:assert/strict';
import { test } from 'vitest';

import { codeFromUrl, joinUrl, parseAppLink, resetUrl } from './app-link.ts';

test('the code is taken from a web link or the app link', () => {
  assert.equal(codeFromUrl('https://fletchr.de/join/ab12CD34ef'), 'AB12CD34EF');
  assert.equal(codeFromUrl('https://fletchr.de/join/AB12CD34EF/'), 'AB12CD34EF');
  assert.equal(codeFromUrl('de.fletchr.app://join/AB12CD34EF'), 'AB12CD34EF');
  assert.equal(codeFromUrl('https://fletchr.de/join/AB12CD34EF?utm=x#y'), 'AB12CD34EF');
});

test('other addresses and odd codes are ignored', () => {
  for (const url of [
    'https://fletchr.de/', 'https://fletchr.de/join/', 'https://evil.example/join/AB12CD34EF', 'http://fletchr.de/join/AB12CD34EF',
    'https://fletchr.de/join/AB12 CD', 'https://fletchr.de/join/<script>', 'https://fletchr.de/joinx/AB12CD34EF',
    'https://fletchr.de.evil.example/join/AB12CD34EF', 'de.fletchr.app://other/AB12CD34EF', '',
  ]) {
    assert.equal(codeFromUrl(url), null, url);
    assert.equal(parseAppLink(url), null, url);
  }
});

test('a reset link is told from an invite link', () => {
  assert.deepEqual(parseAppLink('https://fletchr.de/reset/ab12cd34'), { kind: 'reset', code: 'AB12CD34' });
  assert.deepEqual(parseAppLink('de.fletchr.app://reset/AB12CD34/'), { kind: 'reset', code: 'AB12CD34' });
  assert.deepEqual(parseAppLink('https://fletchr.de/reset/AB12CD34?x=1#y'), { kind: 'reset', code: 'AB12CD34' });
  assert.equal(codeFromUrl('https://fletchr.de/reset/AB12CD34'), null); // not an invite
  for (const url of ['https://fletchr.de/reset/', 'https://fletchr.de/resetx/AB12CD34', 'http://fletchr.de/reset/AB12CD34', 'https://evil.example/reset/AB12CD34']) {
    assert.equal(parseAppLink(url), null, url);
  }
});

test('links built for sharing are read back by the parser', () => {
  assert.equal(joinUrl('ab12-cd34-ef'), 'https://fletchr.de/join/AB12CD34EF');
  assert.deepEqual(parseAppLink(joinUrl('AB12CD34EF')), { kind: 'join', code: 'AB12CD34EF' });
  assert.equal(resetUrl('ab12-cd34'), 'https://fletchr.de/reset/AB12CD34');
  assert.deepEqual(parseAppLink(resetUrl('AB12-CD34')), { kind: 'reset', code: 'AB12CD34' });
});
