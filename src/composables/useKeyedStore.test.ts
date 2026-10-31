import assert from 'node:assert/strict';
import { effectScope, nextTick, ref } from 'vue';
import { beforeEach, test, vi } from 'vitest';

const disk = new Map<string, string>();
vi.mock('@/lib/local-store', () => ({
  dataStore: {
    get: async (k: string) => disk.get(k) ?? null,
    set: async (k: string, v: string) => void disk.set(k, v),
    remove: async (k: string) => void disk.delete(k),
  },
}));

const { useKeyedStore } = await import('./useKeyedStore.ts');

beforeEach(() => disk.clear());

async function setup(initial: string | null = 'log:local:L') {
  const key = ref<string | null>(initial);
  const value = ref(0);
  const store = effectScope().run(() =>
    useKeyedStore<number>({ key, empty: 0, read: () => value.value, apply: (v) => (value.value = v), changes: value }),
  )!;
  await new Promise((r) => setTimeout(r, 0));
  return { key, value, store };
}

test('a change is saved under the current key', async () => {
  const { value } = await setup();
  value.value = 5;
  await nextTick();
  assert.equal(disk.get('log:local:L'), '5');
});

test('while held a change is not saved, so a removed key does not come back', async () => {
  const { value, store } = await setup();
  value.value = 1;
  await nextTick();
  store.hold();
  disk.delete('log:local:L'); // the move removed the local key
  value.value = 2;
  await nextTick();
  assert.equal(disk.has('log:local:L'), false);
  store.release();
  value.value = 3;
  await nextTick();
  assert.equal(disk.get('log:local:L'), '3');
});

test('flush writes the current value at once and a hold keeps it from being written again', async () => {
  const { value, store } = await setup();
  value.value = 7;
  store.hold();
  await store.flush();
  assert.equal(disk.get('log:local:L'), '7');
});

test('a new key ends the hold and loads that key\'s data, not the old one', async () => {
  const { key, value, store } = await setup();
  disk.set('log:acc', '42');
  store.hold();
  key.value = 'log:acc';
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(value.value, 42);
  value.value = 43;
  await nextTick();
  assert.equal(disk.get('log:acc'), '43', 'saving works again under the new key');
  assert.notEqual(disk.get('log:local:L'), '43', 'the old key is not written with the new data');
});

test('flush before the data is loaded writes nothing', async () => {
  const { store } = await setup(null);
  await store.flush();
  assert.equal(disk.size, 0);
});
