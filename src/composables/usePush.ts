import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { type ActionPerformed, PushNotifications, type PushNotificationSchema } from '@capacitor/push-notifications';
import { toastController } from '@ionic/vue';
import { computed, effectScope, onBeforeUnmount, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

import { authReady, setBeforeSignOut, useAuth } from '@/composables/useAuth';
import { useLog } from '@/composables/useLog';
import { useNoteLibrary } from '@/composables/useNoteLibrary';
import { useServer, useServerPush } from '@/composables/useServer';
import { currentLanguage, i18n, t } from '@/i18n';
import { errorMessage } from '@/lib/errors';
import { localStore } from '@/lib/local-store';
import { registrationBody, shouldRegister } from '@/lib/push-registration';
import { type PushData, pushTarget } from '@/lib/push-target';

// Push notifications (specs/design/push-notifications.md). The official app on the official server only: a build with Firebase
// (VITE_PUSH=1, google-services.json), on a phone. Without Firebase the plugin must not even be asked to register, it crashes the app.
const BUILT = import.meta.env.VITE_PUSH === '1' && Capacitor.isNativePlatform();
const TOKEN_KEY = 'pushToken';
const ENABLED_KEY = 'pushEnabled';
const CHANNELS = ['notes', 'evaluations', 'team'] as const;
export type PushType = (typeof CHANNELS)[number];

const { api, status, userId } = useAuth();
const { isOverride } = useServer();
const serverPush = useServerPush();

/** Whether this app and this server can do push at all. */
const available = computed(() => BUILT && !isOverride.value && serverPush.value);
/** What Android says: `prompt` (not asked, or asked once), `denied`, `granted`; `unknown` until read. */
const permission = ref<'unknown' | 'prompt' | 'denied' | 'granted'>('unknown');
/** The main switch in Settings, kept on this phone. Android's permission can stay granted after the person turned it off. */
const enabled = ref(false);
/** The switch as the person sees it: on only while Android allows it too (it can be taken back in the system settings). */
const on = computed(() => enabled.value && permission.value === 'granted');
/** The switches in Settings (kept on the server, one choice for all phones). */
const prefs = ref<Record<PushType, boolean>>({ notes: true, evaluations: true, team: true });
const prefsError = ref('');

let token: string | null = null;
const SWITCH = { notes: 'push_notes', evaluations: 'push_evaluations', team: 'push_team' } as const;

async function readPermission() {
  if (!BUILT) return;
  const { receive } = await PushNotifications.checkPermissions();
  permission.value = receive === 'granted' ? 'granted' : receive === 'denied' ? 'denied' : 'prompt';
}

/** The system dialog. Android stops showing it after two refusals, then only the system settings help. */
async function ask(): Promise<boolean> {
  if (!BUILT) return false;
  const { receive } = await PushNotifications.requestPermissions();
  permission.value = receive === 'granted' ? 'granted' : receive === 'denied' ? 'denied' : 'prompt';
  return permission.value === 'granted';
}

async function createChannels() {
  for (const id of CHANNELS) {
    await PushNotifications.createChannel({ id, name: t(`push.channel.${id}`), description: t(`push.channelHint.${id}`), importance: 4 });
  }
}

/** Tell the server about this phone (Firebase gave a token, or it is still the same). Safe to repeat. */
let sending: string | null = null;
async function sendToken(next: string) {
  if (sending === next) return; // Firebase can report the same token twice at once
  sending = next;
  try {
    const { id } = await CapacitorApp.getInfo();
    const { response } = await api.PUT('/api/devices/', { body: registrationBody(next, token, id, currentLanguage()) });
    if (!response.ok) return;
    token = next;
    await localStore.set(TOKEN_KEY, next);
  } catch {
    // Offline: the next start, return to the app or language change tries again.
  } finally {
    sending = null;
  }
}

async function register() {
  if (!shouldRegister({ available: available.value, signedIn: status.value === 'signedIn', granted: on.value })) return;
  try {
    await createChannels();
    await PushNotifications.register();
  } catch {
    // Firebase could not be reached; tried again later.
  }
}

/** The phone leaves Firebase: no token, nothing sent to Google until the person allows it again. */
async function leave() {
  token = null;
  await localStore.remove(TOKEN_KEY).catch(() => {});
  await PushNotifications.unregister().catch(() => {});
}

/** Sign-out: first the server (it needs the tokens that are about to go, and gives up after a few seconds), then Firebase. */
async function forget() {
  if (!BUILT) return;
  const gone = token;
  // (the generated types have no body for a DELETE, the server wants the token in it)
  if (gone) await api.DELETE('/api/devices/', { body: { token: gone } as never, signal: AbortSignal.timeout(3000) }).catch(() => {});
  await leave();
}

async function loadPrefs() {
  try {
    const { data } = await api.GET('/api/me/');
    if (data) prefs.value = { notes: data.profile.push_notes ?? true, evaluations: data.profile.push_evaluations ?? true, team: data.profile.push_team ?? true };
  } catch {
    // Offline: the switches show what they showed.
  }
}

/** Needs a connection, the server is the one that skips the notification. */
async function setPref(type: PushType, value: boolean) {
  prefsError.value = '';
  try {
    const { data, error } = await api.PATCH('/api/me/', { body: { profile: { [SWITCH[type]]: value } } });
    if (data) prefs.value = { ...prefs.value, [type]: value };
    else prefsError.value = errorMessage(error);
  } catch {
    prefsError.value = errorMessage(undefined);
  }
}

/**
 * The main switch of this phone. Turning it on asks Android for the permission (nothing is asked before); if it is refused the
 * switch stays off. Turning it off removes the phone from the server and from Firebase. Returns whether it is on now.
 */
async function setEnabled(value: boolean): Promise<boolean> {
  if (value) {
    if (permission.value !== 'granted' && !(await ask())) return false;
    enabled.value = true;
    await localStore.set(ENABLED_KEY, '1').catch(() => {});
  } else {
    enabled.value = false;
    await localStore.set(ENABLED_KEY, '0').catch(() => {});
    await forget();
  }
  return on.value === value;
}

/** A phone that allowed notifications before the switch existed (0.18.0 asked on Home) keeps getting them. */
async function start() {
  const saved = await localStore.get(ENABLED_KEY).catch(() => null);
  await readPermission();
  enabled.value = saved === null ? permission.value === 'granted' : saved === '1';
}

if (BUILT) {
  void localStore.get(TOKEN_KEY).then((saved) => (token ??= saved));
  void start();
  setBeforeSignOut(forget);
  effectScope(true).run(() => {
    void PushNotifications.addListener('registration', ({ value }) => void sendToken(value));
    void PushNotifications.addListener('registrationError', () => {});
    watch([available, status, permission, enabled], ([, now], [, before]) => {
      // Signed out without signing out here (the password was changed elsewhere): the phone leaves Firebase too.
      if (before === 'signedIn' && now !== 'signedIn') void leave();
      else void register();
    });
    watch(
      () => i18n.global.locale.value,
      () => void register(),
    );
    watch([available, status], () => available.value && status.value === 'signedIn' && void loadPrefs(), { immediate: true });
    void CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) return;
      void readPermission().then(register);
    });
  });
}

export function usePush() {
  return { available, permission, on, prefs, prefsError, setPref, setEnabled };
}

/** Taps on notifications. Called once, from App.vue: it needs the router. A tap that starts the app arrives as soon as this listens. */
export function usePushTaps() {
  if (!BUILT) return;
  const router = useRouter();
  const log = useLog();
  const notes = useNoteLibrary();

  async function open(data: PushData) {
    await Promise.all([authReady(), router.isReady()]);
    const target = pushTarget(data, {
      userId: userId.value === null ? null : Number(userId.value),
      hasLocalSession: (id) => log.sessions.value.some((s) => s.id === id),
    });
    if (target && router.currentRoute.value.fullPath !== target) await router.push(target);
  }

  async function received(notification: PushNotificationSchema) {
    // The system shows nothing while the app is open: say it here, and learn the new note.
    if (notification.data?.type === 'note') void notes.pull();
    const toast = await toastController.create({
      header: notification.title,
      message: notification.body,
      duration: 6000,
      position: 'top',
      buttons: [{ text: t('push.open'), handler: () => void open(notification.data ?? {}) }],
    });
    await toast.present();
  }

  const handles = [
    PushNotifications.addListener('pushNotificationActionPerformed', ({ notification }: ActionPerformed) => void open(notification.data ?? {})),
    PushNotifications.addListener('pushNotificationReceived', (notification) => void received(notification)),
  ];
  onBeforeUnmount(() => handles.forEach((h) => void h.then((l) => l.remove())));
}
