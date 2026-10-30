import assert from 'node:assert/strict';
import { test } from 'vitest';

import { disableLocalMode, enableLocalMode, type KeyValueStore, loadLocalMode } from './local-mode.ts';

function memory(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get: async (k) => data.get(k) ?? null,
    set: async (k, v) => void data.set(k, v),
    remove: async (k) => void data.delete(k),
  };
}

test('a fresh install is not in local mode', async () => {
  assert.deepEqual(await loadLocalMode(memory()), { enabled: false, id: null });
});

test('entering makes an id once and keeps it', async () => {
  const store = memory();
  const ids = ['first', 'second'];
  const id = await enableLocalMode(store, () => ids.shift()!);
  assert.equal(id, 'first');
  assert.deepEqual(await loadLocalMode(store), { enabled: true, id: 'first' });
  await disableLocalMode(store);
  assert.deepEqual(await loadLocalMode(store), { enabled: false, id: 'first' });
  assert.equal(await enableLocalMode(store, () => ids.shift()!), 'first', 'the same data comes back');
});

test('the flag without an id is not local mode', async () => {
  const store = memory();
  await store.set('local-mode', '1');
  assert.equal((await loadLocalMode(store)).enabled, false);
});
