import assert from 'node:assert/strict';
import { expect, test, vi } from 'vitest';
import { effectScope } from 'vue';

const listeners: Record<string, (e: never) => void> = {};
const removed: string[] = [];
const add = (name: string) => (event: string, cb: (e: never) => void) => {
  listeners[`${name}:${event}`] = cb;
  return Promise.resolve({ remove: () => void removed.push(`${name}:${event}`) });
};
vi.mock('@capacitor/app', () => ({ App: { addListener: add('app') } }));
vi.mock('@capacitor/network', () => ({ Network: { addListener: add('net') } }));

const { useOnReconnect } = await import('./useOnReconnect.ts');

test('runs when the app is shown or the connection returns, not when it goes away, and stops with its scope', async () => {
  let runs = 0;
  const scope = effectScope();
  scope.run(() => useOnReconnect(() => runs++));
  listeners['app:appStateChange']({ isActive: false } as never);
  listeners['net:networkStatusChange']({ connected: false } as never);
  assert.equal(runs, 0);
  listeners['app:appStateChange']({ isActive: true } as never);
  listeners['net:networkStatusChange']({ connected: true } as never);
  assert.equal(runs, 2);
  vi.useFakeTimers();
  runs = 0;
  listeners['net:networkStatusChange']({ connected: true } as never);
  assert.equal(runs, 1);
  vi.advanceTimersByTime(6_000);
  assert.equal(runs, 2); // the first try can meet a connection that is still switching
  vi.advanceTimersByTime(60_000);
  assert.equal(runs, 4);
  scope.stop();
  vi.useRealTimers();
  await new Promise((r) => setTimeout(r, 0));
  expect(removed.sort()).toEqual(['app:appStateChange', 'net:networkStatusChange']);
});
