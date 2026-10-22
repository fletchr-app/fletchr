import assert from 'node:assert/strict';
import { test } from 'vitest';

import { codeFromUrl } from './invite-link.ts';

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
  }
});
