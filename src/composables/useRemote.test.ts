import assert from 'node:assert/strict';
import { test } from 'vitest';
import { effectScope, nextTick, ref } from 'vue';
import { useRemote } from './useRemote.ts';

const settle = async () => {
  await nextTick();
  await new Promise((resolve) => setTimeout(resolve, 0));
};

test('a watched value that changes loads again and replaces what the screen held', async () => {
  const isLocal = ref(false);
  const scope = effectScope();
  const remote = scope.run(() => useRemote(async () => (isLocal.value ? [] : ['account session']), { watch: [isLocal] }))!;
  await settle();
  assert.deepEqual(remote.data.value, ['account session']);
  isLocal.value = true; // signing out: the screen stays alive, its data must go
  await settle();
  assert.deepEqual(remote.data.value, []);
  isLocal.value = false;
  await settle();
  assert.deepEqual(remote.data.value, ['account session']);
  scope.stop();
});

test('without a watch the data stays after the value changed', async () => {
  const isLocal = ref(false);
  const scope = effectScope();
  const remote = scope.run(() => useRemote(async () => (isLocal.value ? [] : ['account session'])))!;
  await settle();
  isLocal.value = true;
  await settle();
  assert.deepEqual(remote.data.value, ['account session']);
  scope.stop();
});

test('a load that failed is tried again when the server can be reached again, one that worked is not', async () => {
  const { reachable } = await import('./reachability.ts');
  let up = false;
  let calls = 0;
  const scope = effectScope();
  const remote = scope.run(() =>
    useRemote(async () => {
      calls++;
      if (!up) throw new Error('offline');
      return ['loaded'];
    }),
  )!;
  await settle();
  assert.equal(remote.data.value, null);
  assert.ok(remote.error.value);

  reachable.value = false; // the banner shows
  await settle();
  up = true;
  reachable.value = true; // and goes away: the failed load runs again
  await settle();
  assert.deepEqual(remote.data.value, ['loaded']);
  assert.equal(remote.error.value, null);
  assert.equal(calls, 2);

  reachable.value = false;
  await settle();
  reachable.value = true; // nothing failed this time, so nothing is fetched again
  await settle();
  assert.equal(calls, 2);
  scope.stop();
});
