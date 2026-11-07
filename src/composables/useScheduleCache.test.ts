import assert from 'node:assert/strict';
import { computed, ref } from 'vue';
import { beforeEach, test, vi } from 'vitest';

// The cache is a module-level singleton: every test loads a fresh copy (`vi.resetModules`) with the server, the storage and
// the phone's events replaced.
const disk = new Map<string, string>();
type AuthStatus = 'loading' | 'signedOut' | 'signedIn' | 'local';
let authStatus = ref<AuthStatus>('signedIn');
let user = ref<string | null>('42');
const GET = vi.fn();
let appListener: (state: { isActive: boolean }) => void = () => {};
let signOutHooks: (() => Promise<void>)[] = [];

const training = { id: 'a', virtual: true, slot: 's', date: '2026-11-03', team: 1, team_name: 'Team A', kind: 'training', name: '', start: '2026-11-03T17:00:00Z', end: '2026-11-03T18:30:00Z', location: 'Hall', time_zone: 'Europe/Berlin', cancelled: false };
const KEY = 'schedule:https://server:42';

vi.mock('@capacitor/app', () => ({ App: { addListener: (_name: string, listener: typeof appListener) => ((appListener = listener), Promise.resolve({ remove: () => {} })) } }));
vi.mock('@capacitor/network', () => ({ Network: { addListener: () => Promise.resolve({ remove: () => {} }) } }));
vi.mock('@/composables/useAuth', () => ({
  useAuth: () => ({
    api: { GET },
    status: authStatus,
    storeOwner: computed(() => (user.value ? { kind: 'account', server: 'https://server', userId: user.value } : null)),
  }),
  addBeforeSignOut: (hook: () => Promise<void>) => void signOutHooks.push(hook),
}));
vi.mock('@/composables/useLog', () => ({ useLog: () => ({ onAccountDeleted: () => {} }) }));
vi.mock('@/lib/local-store', () => ({
  dataStore: {
    get: async (k: string) => disk.get(k) ?? null,
    set: async (k: string, v: string) => void disk.set(k, v),
    remove: async (k: string) => void disk.delete(k),
  },
}));

function server(online: boolean) {
  GET.mockReset().mockImplementation(async (path: string) => {
    if (!online) throw new TypeError('offline');
    if (path === '/api/teams/') return { data: [{ id: 1, name: 'Team A', my_role: 'archer', also_shoots: false }] };
    if (path === '/api/events/agenda/') return { data: [training] };
    return { data: [] };
  });
}

const tick = () => new Promise((r) => setTimeout(r, 0));

async function load() {
  vi.resetModules();
  const { useScheduleCache } = await import('./useScheduleCache.ts');
  const { useAgenda } = await import('./useAgenda.ts');
  const { useTeams } = await import('./useTeams.ts');
  await tick();
  await tick();
  return { cache: useScheduleCache(), agenda: useAgenda(), teams: useTeams() };
}

const saved = (teams: unknown[] = [{ id: 1, name: 'Team A', my_role: 'archer', also_shoots: false }], rosters: unknown = {}) =>
  JSON.stringify({ teams, members: {}, ...(rosters ? { rosters, templates: {} } : {}), agenda: [training], from: '2026-10-01T00:00:00Z', to: '2027-01-30T00:00:00Z', pulledAt: '2026-11-01T08:00:00Z' });

beforeEach(() => {
  disk.clear();
  authStatus = ref<AuthStatus>('signedIn');
  user = ref<string | null>('42');
  signOutHooks = [];
});

test('started without the server, the copy on the phone suggests the training and lists the teams', async () => {
  disk.set(KEY, saved());
  server(false);
  const { agenda, teams } = await load();
  assert.deepEqual(agenda.suggest('2026-11-03T17:30:00Z').map((i) => i.id), ['a']);
  assert.deepEqual(teams.teams.value.map((t) => t.id), [1]);
  assert.equal(teams.loaded.value, true);
  assert.equal(disk.get(KEY), saved()); // a failed pull keeps the copy
});

test('a copy written before the rosters existed loads, with no rosters, and keeps its agenda', async () => {
  disk.set(KEY, saved(undefined, null));
  server(false);
  const { agenda, cache } = await load();
  assert.deepEqual(agenda.suggest('2026-11-03T17:30:00Z').map((i) => i.id), ['a']);
  assert.deepEqual(cache.state.value.rosters, {});
});

test('a pull writes the copy to the phone', async () => {
  server(true);
  const { agenda } = await load();
  assert.equal(agenda.loaded.value, true);
  const stored = JSON.parse(disk.get(KEY)!);
  assert.deepEqual(stored.agenda.map((i: { id: string }) => i.id), ['a']);
  assert.equal(stored.teams[0].name, 'Team A');
  assert.equal(GET.mock.calls.filter(([path]) => path === '/api/events/agenda/').length, 1);
});

test('another account starts empty', async () => {
  disk.set('schedule:https://server:7', saved());
  server(false);
  const { agenda, teams } = await load();
  assert.deepEqual(agenda.suggest('2026-11-03T17:30:00Z'), []);
  assert.deepEqual(teams.teams.value, []);
});

test('coming back to the front pulls again once the copy is old, a forced pull always', async () => {
  server(true);
  const { cache } = await load();
  const agendaCalls = () => GET.mock.calls.filter(([path]) => path === '/api/events/agenda/').length;
  assert.equal(agendaCalls(), 1);
  appListener({ isActive: true });
  await tick();
  assert.equal(agendaCalls(), 1); // fresh: not again
  await cache.pull(true);
  assert.equal(agendaCalls(), 2);
});

test('a pull that failed is tried again when the app comes back', async () => {
  server(false);
  const { agenda } = await load();
  assert.equal(agenda.loaded.value, false);
  server(true);
  appListener({ isActive: true });
  await tick();
  await tick();
  assert.equal(agenda.loaded.value, true);
});

test('signing out removes the copy from the phone', async () => {
  server(true);
  const { agenda } = await load();
  assert.ok(disk.has(KEY));
  for (const hook of signOutHooks) await hook();
  await tick();
  assert.equal(disk.has(KEY), false);
  assert.deepEqual(agenda.items.value, []);
});

test('offline, the teams to write notes in come from the copy', async () => {
  disk.set(
    KEY,
    JSON.stringify({ ...JSON.parse(saved([{ id: 1, name: 'Team A', my_role: 'coach', also_shoots: false }])), members: { '1': [{ user_id: 7, name: 'Ann', role: 'archer', also_shoots: false, managed: false }] } }),
  );
  server(false);
  const { cache } = await load();
  assert.deepEqual(await cache.writableTeams(7), [{ id: 1, name: 'Team A' }]);
  assert.deepEqual(await cache.writableTeams(8), []);
});
