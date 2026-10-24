import assert from 'node:assert/strict';
import { test } from 'vitest';

import { compareVersions, compatibility, parseVersion } from './version.ts';

test('a version is read, and anything else is not', () => {
  assert.deepEqual(parseVersion('0.5.1'), [0, 5, 1]);
  assert.deepEqual(parseVersion('1.10.0-beta'), [1, 10, 0]);
  assert.equal(parseVersion('x'), null);
  assert.equal(parseVersion(null), null);
});

test('versions compare by number, not as text', () => {
  assert.ok(compareVersions([0, 10, 0], [0, 9, 0]) > 0);
  assert.ok(compareVersions([0, 5, 1], [0, 5, 2]) < 0);
  assert.equal(compareVersions([1, 2, 3], [1, 2, 3]), 0);
});

test('the same or a patch apart is fine', () => {
  assert.equal(compatibility('0.5.0', '0.5.0', '0.1.0'), 'ok');
  assert.equal(compatibility('0.5.2', '0.5.0', '0.1.0'), 'ok');
  assert.equal(compatibility('0.5.0', '0.5.3', '0.1.0'), 'ok');
});

test('an app below the minimum of the server is too old', () => {
  assert.equal(compatibility('0.3.0', '0.5.0', '0.4.0'), 'appTooOld');
  assert.equal(compatibility('0.4.0', '0.5.0', '0.4.0'), 'ok');
});

test('a server a minor version or more behind the app is older', () => {
  assert.equal(compatibility('0.5.0', '0.4.0', '0.1.0'), 'serverOlder');
  assert.equal(compatibility('1.0.0', '0.9.9', '0.1.0'), 'serverOlder');
});

test('a newer server is fine, and what is not known counts as fine', () => {
  assert.equal(compatibility('0.5.0', '0.6.0', '0.1.0'), 'ok');
  assert.equal(compatibility('0.5.0', null, null), 'ok');
  assert.equal(compatibility('0.5.0', '0.4.0', undefined), 'serverOlder'); // an old server has no minimum but has a version
  assert.equal(compatibility('dev', '0.4.0', '0.9.0'), 'ok');
});

test('the too-old app wins over the older server', () => {
  assert.equal(compatibility('0.1.0', '0.5.0', '0.4.0'), 'appTooOld');
});
