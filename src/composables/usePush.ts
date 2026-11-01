import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { type ActionPerformed, PushNotifications, type PushNotificationSchema } from '@capacitor/push-notifications';
import { alertController, toastController } from '@ionic/vue';
import { computed, effectScope, onBeforeUnmount, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

import { authReady, setBeforeSignOut, useAuth } from '@/composables/useAuth';
import { useLog } from '@/composables/useLog';
import { useNoteLibrary } from '@/composables/useNoteLibrary';
import { useServer, useServerPush } from '@/composables/useServer';
import { useTeams } from '@/composables/useTeams';
import { currentLanguage, i18n, t } from '@/i18n';
import { errorMessage } from '@/lib/errors';
import { localStore } from '@/lib/local-store';
import { registrationBody, shouldRegister } from '@/lib/push-registration';
import { type PushData, pushTarget } from '@/lib/push-target';

// Push notifications (specs/design/push-notifications.md). The official app on the official server only: a build with Firebase
// (VITE_PUSH=1, google-services.json), on a phone. Without Firebase the plugin must not even be asked to register, it crashes the app.
const BUILT = import.meta.env.VITE_PUSH === '1' && Capacitor.isNativePlatform();
const TOKEN_KEY = 'pushToken';
const ASKED_KEY = 'pushAsked';
const CHANNELS = ['notes', 'evaluations', 'team'] as const;
export type PushType = (typeof CHANNELS)[number];

const { api, status, userId } = useAuth();
const { isOverride } = useServer();
const serverPush = useServerPush();

/** Whether this app and this server can do push at all. */
const available = computed(() => BUILT && !isOverride.value && serverPush.value);
/** What Android says: `prompt` (not asked, or asked once), `denied`, `granted`; `unknown` until read. */
const permission = ref<'unknown' | 'prompt' | 'denied' | 'granted'>('unknown');
/** The person said "Not now" to the explanation on Home, or allowed: it is not shown again. */
const asked = ref(true);
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
async function sendToken(next: string) {
  try {
    const { id } = await CapacitorApp.getInfo();
    const { response } = await api.PUT('/api/devices/', { body: registrationBody(next, token, id, currentLanguage()) });
    if (!response.ok) return;
    token = next;
    await localStore.set(TOKEN_KEY, next);
  } catch {
    // Offline: the next start, return to the app or language change tries again.
  }
}

async function register() {
  if (!shouldRegister({ available: available.value, signedIn: status.value === 'signedIn', granted: permission.value === 'granted' })) return;
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

/** Needs a connection, the server is the one that skips the notification. Turning one on without the permission asks for it first. */
async function setPref(type: PushType, on: boolean) {
  prefsError.value = '';
  if (on && permission.value !== 'granted') await ask();
  try {
    const { data, error } = await api.PATCH('/api/me/', { body: { profile: { [SWITCH[type]]: on } } });
    if (data) prefs.value = { ...prefs.value, [type]: on };
    else prefsError.value = errorMessage(error);
  } catch {
    prefsError.value = errorMessage(undefined);
  }
}

/** Once, on Home: say what the notifications are for before Android asks. For someone who is in a team, because only then there is anyone to send one. */
async function offer() {
  const { teams } = useTeams();
  if (!available.value || status.value !== 'signedIn' || permission.value !== 'prompt' || asked.value || teams.value.length === 0) return;
  asked.value = true;
  void localStore.set(ASKED_KEY, '1').catch(() => {});
  const alert = await alertController.create({
    header: t('push.offer.title'),
    message: t('push.offer.message'),
    buttons: [
      { text: t('push.offer.later'), role: 'cancel' },
      { text: t('push.offer.allow'), role: 'confirm' },
    ],
  });
  await alert.present();
  if ((await alert.onDidDismiss()).role === 'confirm') await ask();
}

if (BUILT) {
  void localStore.get(TOKEN_KEY).then((saved) => (token ??= saved));
  void localStore.get(ASKED_KEY).then((saved) => (asked.value = saved === '1'));
  void readPermission();
  setBeforeSignOut(forget);
  effectScope(true).run(() => {
    void PushNotifications.addListener('registration', ({ value }) => void sendToken(value));
    void PushNotifications.addListener('registrationError', () => {});
    watch([available, status, permission], ([, now], [, before]) => {
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
  return { available, permission, prefs, prefsError, setPref, ask, offer };
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
