import assert from 'node:assert/strict';
import { ref } from 'vue';
import { afterEach, beforeEach, test, vi } from 'vitest';

import de from '@/locales/de';
import en from '@/locales/en';

// The composable is a module-level singleton: every test loads a fresh copy (`vi.resetModules`) with the phone, the server
// and the storage replaced.
const disk = new Map<string, string>();
type AuthStatus = 'loading' | 'signedOut' | 'signedIn' | 'local';
// A new ref for every test: the watchers of the copies loaded before must not see this test's sign-out
let authStatus = ref<AuthStatus>('signedIn');
const agenda = [
  { id: 'a', virtual: true, slot: 's', date: '2026-11-03', team: 1, team_name: 'Team A', kind: 'training', name: '', start: '2026-11-03T17:00:00Z', end: '2026-11-03T18:30:00Z', location: 'Hall', time_zone: 'Europe/Berlin', cancelled: false },
  { id: 'b', virtual: true, slot: 's', date: '2026-11-10', team: 1, team_name: 'Team A', kind: 'training', name: '', start: '2026-11-10T17:00:00Z', end: '2026-11-10T18:30:00Z', location: 'Hall', time_zone: 'Europe/Berlin', cancelled: false },
];
const GET = vi.fn();
const phone = {
  permission: vi.fn(),
  requestPermission: vi.fn(),
  findOrCreateCalendar: vi.fn(),
  deleteCalendar: vi.fn(),
  listInstances: vi.fn(),
  create: vi.fn(),
  remove: vi.fn(),
};
let appListener: (state: { isActive: boolean }) => void = () => {};

vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: () => 'android' } }));
vi.mock('@capacitor/app', () => ({
  App: { addListener: async (_name: string, listener: typeof appListener) => void (appListener = listener) },
}));
vi.mock('@/composables/useAuth', () => ({ useAuth: () => ({ api: { GET }, status: authStatus }) }));
vi.mock('@/lib/local-store', () => ({
  localStore: {
    get: async (k: string) => disk.get(k) ?? null,
    set: async (k: string, v: string) => void disk.set(k, v),
    remove: async (k: string) => void disk.delete(k),
  },
}));
vi.mock('@/lib/device-calendar-native', () => ({
  permission: () => phone.permission(),
  requestPermission: () => phone.requestPermission(),
  findOrCreateCalendar: (title: string) => phone.findOrCreateCalendar(title),
  deleteCalendar: () => phone.deleteCalendar(),
  nativeBackend: {
    listInstances: (...args: unknown[]) => phone.listInstances(...args),
    create: (...args: unknown[]) => phone.create(...args),
    remove: (...args: unknown[]) => phone.remove(...args),
  },
}));

async function load() {
  vi.resetModules();
  const { useDeviceCalendar, REMINDER_CHOICES } = await import('./useDeviceCalendar.ts');
  return { calendar: useDeviceCalendar(), REMINDER_CHOICES };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  disk.clear();
  authStatus = ref<AuthStatus>('signedIn');
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-01T10:00:00Z'));
  GET.mockReset().mockResolvedValue({ data: agenda });
  phone.permission.mockReset().mockResolvedValue('granted');
  phone.requestPermission.mockReset().mockResolvedValue(true);
  phone.findOrCreateCalendar.mockReset().mockResolvedValue('cal-1');
  phone.deleteCalendar.mockReset().mockResolvedValue(undefined);
  phone.listInstances.mockReset().mockResolvedValue([]);
  phone.create.mockReset().mockResolvedValue(undefined);
  phone.remove.mockReset().mockResolvedValue(undefined);
});

afterEach(() => vi.useRealTimers());

test('turning on without the permission stays off and writes nothing', async () => {
  phone.requestPermission.mockResolvedValue(false);
  const { calendar } = await load();
  assert.equal(await calendar.enable(), false);
  assert.equal(calendar.enabled.value, false);
  assert.equal(calendar.status.value, 'noPermission');
  assert.equal(disk.get('deviceCalendar'), undefined);
  assert.equal(phone.findOrCreateCalendar.mock.calls.length, 0);
  assert.equal(GET.mock.calls.length, 0);
});

test('turning on with the permission makes the calendar and writes every training', async () => {
  const { calendar } = await load();
  assert.equal(await calendar.enable(), true);
  assert.equal(calendar.enabled.value, true);
  assert.equal(calendar.status.value, 'ok');
  assert.equal(disk.get('deviceCalendar'), '1');
  assert.equal(phone.findOrCreateCalendar.mock.calls[0]![0], 'Fletchr');
  assert.equal(phone.create.mock.calls.length, 2);
  assert.equal(phone.create.mock.calls[0]![0], 'cal-1');
  assert.equal(phone.create.mock.calls[0]![1].title, 'Training · Team A');
  assert.ok(calendar.lastSync.value);
});

test('a sync fetches the agenda for yesterday to 119 days ahead', async () => {
  const { calendar } = await load();
  await calendar.enable();
  const query = GET.mock.calls[0]![1].params.query;
  assert.equal(query.from, '2026-10-31T10:00:00.000Z');
  assert.equal(query.to, new Date(Date.parse('2026-10-31T10:00:00Z') + 119 * 86_400_000).toISOString());
});

test('nothing happens while the switch is off or nobody is signed in', async () => {
  const { calendar } = await load();
  await calendar.sync(true);
  assert.equal(GET.mock.calls.length, 0);
  await calendar.enable();
  GET.mockClear();
  authStatus.value = 'local';
  await tick();
  GET.mockClear();
  await calendar.sync(true);
  assert.equal(GET.mock.calls.length, 0);
});

test('a sync inside 15 minutes is skipped unless forced', async () => {
  const { calendar } = await load();
  await calendar.enable();
  GET.mockClear();
  vi.setSystemTime(new Date('2026-11-01T10:10:00Z'));
  await calendar.sync();
  assert.equal(GET.mock.calls.length, 0);
  vi.setSystemTime(new Date('2026-11-01T10:16:00Z'));
  await calendar.sync();
  assert.equal(GET.mock.calls.length, 1);
  await calendar.sync(true);
  assert.equal(GET.mock.calls.length, 2);
});

test('the app coming back to the front syncs, going to the back does not', async () => {
  const { calendar } = await load();
  await calendar.enable();
  GET.mockClear();
  vi.setSystemTime(new Date('2026-11-01T11:00:00Z'));
  appListener({ isActive: false });
  await tick();
  assert.equal(GET.mock.calls.length, 0);
  appListener({ isActive: true });
  await tick();
  assert.equal(GET.mock.calls.length, 1);
  assert.equal(calendar.status.value, 'ok');
});

test('two syncs at once run one after the other, never together', async () => {
  const { calendar } = await load();
  await calendar.enable();
  GET.mockClear();
  let active = 0;
  let most = 0;
  phone.listInstances.mockImplementation(async () => {
    active++;
    most = Math.max(most, active);
    await tick();
    active--;
    return [];
  });
  await Promise.all([calendar.sync(true), calendar.sync(true), calendar.sync(true)]);
  assert.equal(most, 1);
  assert.equal(GET.mock.calls.length, 2); // the running one, and one more for everything that came meanwhile
});

test('without a connection the calendar is left as it was', async () => {
  const { calendar } = await load();
  await calendar.enable();
  phone.create.mockClear();
  phone.remove.mockClear();
  GET.mockResolvedValue({ data: undefined });
  await calendar.sync(true);
  assert.equal(calendar.status.value, 'offline');
  GET.mockRejectedValue(new TypeError('Failed to fetch'));
  await calendar.sync(true);
  assert.equal(calendar.status.value, 'offline');
  assert.equal(phone.create.mock.calls.length + phone.remove.mock.calls.length, 0);
});

test('a failing calendar shows an error and the next sync tries again', async () => {
  const { calendar } = await load();
  await calendar.enable();
  phone.listInstances.mockRejectedValueOnce(new Error('provider gone'));
  await calendar.sync(true);
  assert.equal(calendar.status.value, 'error');
  await calendar.sync(true);
  assert.equal(calendar.status.value, 'ok');
});

test('a withdrawn permission is shown, the switch stays on and nothing is fetched', async () => {
  const { calendar } = await load();
  await calendar.enable();
  GET.mockClear();
  phone.permission.mockResolvedValue('denied');
  await calendar.sync(true);
  assert.equal(calendar.status.value, 'noPermission');
  assert.equal(calendar.enabled.value, true);
  assert.equal(GET.mock.calls.length, 0);
  phone.permission.mockResolvedValue('granted');
  await calendar.sync(true);
  assert.equal(calendar.status.value, 'ok');
});

test('turning off deletes the calendar and forgets the setting', async () => {
  const { calendar } = await load();
  await calendar.enable();
  await calendar.disable();
  assert.equal(calendar.enabled.value, false);
  assert.equal(calendar.status.value, 'off');
  assert.equal(phone.deleteCalendar.mock.calls.length, 1);
  assert.equal(disk.get('deviceCalendar'), undefined);
});

test('signing out deletes the calendar, so the next account does not see these trainings', async () => {
  const { calendar } = await load();
  await calendar.enable();
  authStatus.value = 'local';
  await tick();
  await tick();
  assert.equal(phone.deleteCalendar.mock.calls.length, 1);
  assert.equal(calendar.enabled.value, false);
  assert.equal(disk.get('deviceCalendar'), undefined);
});

test('the reminder is kept and goes into the entries', async () => {
  const { calendar } = await load();
  await calendar.enable();
  assert.deepEqual(phone.create.mock.calls[0]![1].alerts, []);
  await calendar.setReminder(60);
  assert.equal(disk.get('deviceCalendarReminder'), '60');
  assert.equal(calendar.reminder.value, 60);
  assert.deepEqual(phone.create.mock.calls.at(-1)![1].alerts, [-60]);
});

test('the settings are read again after a restart', async () => {
  disk.set('deviceCalendar', '1');
  disk.set('deviceCalendarReminder', '1440');
  const { calendar } = await load();
  await tick();
  await tick();
  assert.equal(calendar.enabled.value, true);
  assert.equal(calendar.reminder.value, 1440);
  assert.ok(GET.mock.calls.length >= 1);
});

test('every reminder choice has a text in English and German', async () => {
  const { REMINDER_CHOICES } = await load();
  for (const minutes of REMINDER_CHOICES) {
    const key = `reminder${minutes || 'None'}`;
    assert.ok(typeof (en.deviceCalendar as Record<string, string>)[key] === 'string', `en ${key}`);
    assert.ok(typeof (de.deviceCalendar as Record<string, string>)[key] === 'string', `de ${key}`);
  }
});
