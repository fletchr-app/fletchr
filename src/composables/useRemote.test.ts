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
