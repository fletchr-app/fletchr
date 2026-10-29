import assert from 'node:assert/strict';
import { test } from 'vitest';

import { ownerKey, storeKey, type StoreOwner } from './store-owner.ts';

const account: StoreOwner = { kind: 'account', server: 'https://fletchr.example', userId: '42' };

test('an account keeps the key the log and the media queue had before owners existed', () => {
  assert.equal(storeKey('log', account), 'log:https://fletchr.example:42');
  assert.equal(storeKey('media', account), 'media:https://fletchr.example:42');
});

test('a local owner has its own key', () => {
  assert.equal(storeKey('log', { kind: 'local', id: 'abc' }), 'log:local:abc');
});

test('a local owner never shares a key with an account', () => {
  const keys = new Set([
    ownerKey({ kind: 'local', id: '42' }),
    ownerKey(account),
    ownerKey({ kind: 'account', server: 'https://other.example', userId: '42' }),
    ownerKey({ kind: 'account', server: 'https://fletchr.example', userId: '43' }),
  ]);
  assert.equal(keys.size, 4);
});

test('the same owner has a different key per store', () => {
  assert.notEqual(storeKey('log', account), storeKey('notes', account));
});
