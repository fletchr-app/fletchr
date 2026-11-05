import assert from 'node:assert/strict';
import { afterEach, test, vi } from 'vitest';

import { AuthSession } from './auth-session.ts';

vi.mock('@/lib/token-storage', () => ({ loadTokens: async () => null, saveTokens: async () => {} }));
afterEach(() => vi.unstubAllGlobals());

test('a request that gets no answer reports the server as not reached, an answer reports it as reached', async () => {
  // The client keeps the `fetch` it finds when it is created, so the stub is in place first and answers as told.
  let answer: () => Promise<Response> = async () => new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
  vi.stubGlobal('fetch', () => answer());
  const reported: boolean[] = [];
  const session = new AuthSession('http://server.test', () => 'en', (reached) => reported.push(reached));

  answer = async () => {
    throw new TypeError('Failed to fetch');
  };
  // The caller still gets the network error itself.
  await assert.rejects(session.api.GET('/api/health/'), TypeError);
  assert.deepEqual(reported, [false]);

  answer = async () => new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
  await session.api.GET('/api/health/');
  answer = async () => new Response('', { status: 502 });
  await session.api.GET('/api/health/');
  assert.deepEqual(reported, [false, true, false]);
});
