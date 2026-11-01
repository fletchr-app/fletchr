import assert from 'node:assert/strict';
import { ref } from 'vue';
import { afterEach, beforeEach, test, vi } from 'vitest';

// The composable is a module-level singleton: every test loads a fresh copy (`vi.resetModules`) with the plugin, the server and the storage replaced.
const disk = new Map<string, string>();
type AuthStatus = 'loading' | 'signedOut' | 'signedIn' | 'local';
let authStatus = ref<AuthStatus>('signedIn');
let serverPush = ref(true);
let isOverride = ref(false);
const calls: string[] = []; // the order of what happens
const PUT = vi.fn();
const DELETE = vi.fn();
const GET = vi.fn();
const PATCH = vi.fn();
const plugin = {
  checkPermissions: vi.fn(),
  requestPermissions: vi.fn(),
  register: vi.fn(),
  unregister: vi.fn(),
  createChannel: vi.fn(),
};
let onRegistration: (token: { value: string }) => void = () => {};
let setBeforeSignOut: (hook: () => Promise<void>) => void = () => {};
let signOutHook: (() => Promise<void>) | null = null;

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }));
vi.mock('@capacitor/app', () => ({ App: { addListener: async () => ({ remove: () => {} }), getInfo: async () => ({ id: 'de.fletchr.app' }) } }));
vi.mock('@capacitor/push-notifications', () => ({
  PushNotifications: {
    checkPermissions: () => plugin.checkPermissions(),
    requestPermissions: () => plugin.requestPermissions(),
    register: () => (calls.push('register'), plugin.register()),
    unregister: () => (calls.push('unregister'), plugin.unregister()),
    createChannel: (c: unknown) => plugin.createChannel(c),
    addListener: async (name: string, listener: (event: never) => void) => {
      if (name === 'registration') onRegistration = listener as never;
      return { remove: () => {} };
    },
  },
}));
vi.mock('@ionic/vue', () => ({ alertController: {}, toastController: {} }));
vi.mock('vue-router', () => ({ useRouter: () => ({}) }));
vi.mock('@/composables/useAuth', () => ({
  useAuth: () => ({ api: { PUT, DELETE, GET, PATCH }, status: authStatus, userId: ref('7') }),
  authReady: async () => {},
  setBeforeSignOut: (hook: () => Promise<void>) => {
    signOutHook = hook;
    setBeforeSignOut(hook);
  },
}));
vi.mock('@/composables/useServer', () => ({ useServer: () => ({ isOverride }), useServerPush: () => serverPush }));
vi.mock('@/composables/useLog', () => ({ useLog: () => ({ sessions: ref([]) }) }));
vi.mock('@/composables/useNoteLibrary', () => ({ useNoteLibrary: () => ({ pull: async () => {} }) }));
vi.mock('@/composables/useTeams', () => ({ useTeams: () => ({ teams: ref([{ id: 1 }]) }) }));
vi.mock('@/lib/local-store', () => ({
  localStore: {
    get: async (k: string) => disk.get(k) ?? null,
    set: async (k: string, v: string) => void disk.set(k, v),
    remove: async (k: string) => void disk.delete(k),
  },
}));

async function load() {
  vi.resetModules();
  const { usePush } = await import('./usePush.ts');
  await tick();
  return usePush();
}

const tick = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  vi.stubEnv('VITE_PUSH', '1');
  disk.clear();
  calls.length = 0;
  signOutHook = null;
  authStatus = ref<AuthStatus>('signedIn');
  serverPush = ref(true);
  isOverride = ref(false);
  PUT.mockReset().mockResolvedValue({ response: { ok: true } });
  DELETE.mockReset().mockImplementation(async () => (calls.push('delete'), { response: { ok: true } }));
  GET.mockReset().mockResolvedValue({ data: { profile: { push_notes: false, push_evaluations: true, push_team: true } } });
  PATCH.mockReset().mockResolvedValue({ data: {} });
  plugin.checkPermissions.mockReset().mockResolvedValue({ receive: 'granted' });
  plugin.requestPermissions.mockReset().mockResolvedValue({ receive: 'granted' });
  plugin.register.mockReset().mockResolvedValue(undefined);
  plugin.unregister.mockReset().mockResolvedValue(undefined);
  plugin.createChannel.mockReset().mockResolvedValue(undefined);
});

afterEach(() => vi.unstubAllEnvs());

test('signed in with the permission: the phone registers and the server hears of its token and language', async () => {
  await load();
  await tick();
  assert.equal(plugin.register.mock.calls.length, 1);
  assert.deepEqual(plugin.createChannel.mock.calls.map((c) => c[0].id), ['notes', 'evaluations', 'team']);
  onRegistration({ value: 'token-1' });
  await tick();
  assert.deepEqual(PUT.mock.calls[0]![1].body, { token: 'token-1', app_id: 'de.fletchr.app', language: 'en' });
  assert.equal(disk.get('pushToken'), 'token-1');
});

test('a new token names the old one, so the server drops it', async () => {
  disk.set('pushToken', 'old');
  await load();
  onRegistration({ value: 'new' });
  await tick();
  assert.equal(PUT.mock.calls[0]![1].body.replaces, 'old');
  assert.equal(disk.get('pushToken'), 'new');
});

test('a token the server did not take is not remembered', async () => {
  PUT.mockResolvedValue({ response: { ok: false } });
  await load();
  onRegistration({ value: 'token-1' });
  await tick();
  assert.equal(disk.get('pushToken'), undefined);
});

test('nothing happens without the permission', async () => {
  plugin.checkPermissions.mockResolvedValue({ receive: 'prompt' });
  const push = await load();
  assert.equal(plugin.register.mock.calls.length, 0);
  assert.equal(push.permission.value, 'prompt');
});

test('nothing happens when the server has no push, or is not the official one, or nobody is signed in', async () => {
  serverPush = ref(false);
  await load();
  assert.equal(plugin.register.mock.calls.length, 0);
  serverPush = ref(true);
  isOverride = ref(true);
  await load();
  assert.equal(plugin.register.mock.calls.length, 0);
  isOverride = ref(false);
  authStatus = ref<AuthStatus>('local');
  await load();
  assert.equal(plugin.register.mock.calls.length, 0);
});

test('without Firebase in the build the plugin is not touched', async () => {
  vi.stubEnv('VITE_PUSH', '');
  await load();
  assert.equal(plugin.checkPermissions.mock.calls.length, 0);
  assert.equal(plugin.register.mock.calls.length, 0);
  assert.equal(signOutHook, null);
});

test('signing out removes the phone from the server first, then leaves Firebase', async () => {
  disk.set('pushToken', 'token-1');
  await load();
  calls.length = 0;
  await signOutHook!();
  assert.deepEqual(calls, ['delete', 'unregister']);
  assert.deepEqual(DELETE.mock.calls[0]![1].body, { token: 'token-1' });
  assert.equal(disk.get('pushToken'), undefined);
});

test('signing out while offline still leaves Firebase', async () => {
  disk.set('pushToken', 'token-1');
  DELETE.mockRejectedValue(new Error('offline'));
  await load();
  await signOutHook!();
  assert.equal(plugin.unregister.mock.calls.length, 1);
  assert.equal(disk.get('pushToken'), undefined);
});

test('a session that ends elsewhere (the password was changed) leaves Firebase', async () => {
  disk.set('pushToken', 'token-1');
  await load();
  authStatus.value = 'signedOut';
  await tick();
  assert.equal(plugin.unregister.mock.calls.length, 1);
  assert.equal(DELETE.mock.calls.length, 0);
});

test('the switches come from the server and turning one off is saved there', async () => {
  const push = await load();
  await tick();
  assert.deepEqual(push.prefs.value, { notes: false, evaluations: true, team: true });
  await push.setPref('evaluations', false);
  assert.deepEqual(PATCH.mock.calls[0]![1].body, { profile: { push_evaluations: false } });
  assert.equal(push.prefs.value.evaluations, false);
});

test('a switch that the server refused stays as it was', async () => {
  PATCH.mockResolvedValue({ error: { detail: 'no' } });
  const push = await load();
  await tick();
  await push.setPref('team', false);
  assert.equal(push.prefs.value.team, true);
  assert.ok(push.prefsError.value);
});

test('a phone that allowed notifications before the main switch existed keeps them on', async () => {
  const push = await load();
  await tick();
  assert.equal(push.on.value, true);
  assert.equal(plugin.register.mock.calls.length, 1);
});

test('the main switch off is remembered: no registration, and nothing is asked', async () => {
  disk.set('pushEnabled', '0');
  const push = await load();
  await tick();
  assert.equal(push.on.value, false);
  assert.equal(plugin.register.mock.calls.length, 0);
  assert.equal(plugin.requestPermissions.mock.calls.length, 0);
});

test('without the permission nothing is asked until the main switch is turned on', async () => {
  plugin.checkPermissions.mockResolvedValue({ receive: 'prompt' });
  const push = await load();
  await tick();
  assert.equal(plugin.requestPermissions.mock.calls.length, 0);
  assert.equal(await push.setEnabled(true), true);
  assert.equal(plugin.requestPermissions.mock.calls.length, 1);
  assert.equal(disk.get('pushEnabled'), '1');
  await tick();
  assert.equal(plugin.register.mock.calls.length, 1);
});

test('refused by Android: the main switch stays off', async () => {
  plugin.checkPermissions.mockResolvedValue({ receive: 'prompt' });
  plugin.requestPermissions.mockResolvedValue({ receive: 'denied' });
  const push = await load();
  await tick();
  assert.equal(await push.setEnabled(true), false);
  assert.equal(push.on.value, false);
  assert.equal(push.permission.value, 'denied');
  assert.equal(plugin.register.mock.calls.length, 0);
  assert.notEqual(disk.get('pushEnabled'), '1');
});

test('the main switch off removes the phone from the server and Firebase', async () => {
  disk.set('pushToken', 'token-1');
  const push = await load();
  await tick();
  calls.length = 0;
  assert.equal(await push.setEnabled(false), true);
  assert.deepEqual(calls, ['delete', 'unregister']);
  assert.equal(disk.get('pushEnabled'), '0');
  assert.equal(push.on.value, false);
});

test('turning a type switch on asks nothing, the main switch did that', async () => {
  plugin.checkPermissions.mockResolvedValue({ receive: 'prompt' });
  const push = await load();
  await tick();
  await push.setPref('notes', true);
  assert.equal(plugin.requestPermissions.mock.calls.length, 0);
  assert.equal(PATCH.mock.calls.length, 1);
});
