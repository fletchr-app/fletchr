import { App } from '@capacitor/app';
import { computed, effectScope, ref, watch, watchEffect } from 'vue';

import { useLocalMode } from '@/composables/useLocalMode';
import { normaliseUrl } from '@/lib/server-address';
import { compatibility } from '@/lib/version';

// Default server address comes from VITE_SERVER_URL (.env), so one build can point at a local server
// or the VPS. The custom server screens override it; the override is stored on the device.
export const DEFAULT_SERVER_URL = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:8080';

const STORAGE_KEY = 'serverUrl';

export { normaliseUrl };

function readOverride(): string | null {
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

const LAST_CUSTOM_KEY = 'lastCustomServer';

/** The last custom server that answered, to prefill the custom sign-in screen. */
export function lastCustomServer(): string {
  try {
    return globalThis.localStorage?.getItem(LAST_CUSTOM_KEY) ?? '';
  } catch {
    return '';
  }
}

export function rememberCustomServer(address: string) {
  try {
    globalThis.localStorage?.setItem(LAST_CUSTOM_KEY, address);
  } catch {
    // Not remembered; the address is typed again next time.
  }
}

const override = ref<string | null>(readOverride());
const url = computed(() => override.value ?? DEFAULT_SERVER_URL);

function setUrl(next: string | null) {
  const value = next === null || normaliseUrl(next) === '' ? null : normaliseUrl(next);
  override.value = value;
  try {
    if (value === null) globalThis.localStorage?.removeItem(STORAGE_KEY);
    else globalThis.localStorage?.setItem(STORAGE_KEY, value);
  } catch {
    // Storage failed: the address holds for this session only.
  }
}

export function useServer() {
  return { url, isOverride: computed(() => override.value !== null), setUrl };
}

export type HealthState = 'checking' | 'ok' | 'unreachable';

/** One health request to an address that is not the current server yet. */
export async function checkServer(address: string, timeoutMs = 8000): Promise<'ok' | 'unreachable'> {
  try {
    const res = await fetch(`${address}/api/health/`, { signal: AbortSignal.timeout(timeoutMs) });
    return res.ok ? 'ok' : 'unreachable';
  } catch {
    return 'unreachable';
  }
}

// What the server says about itself: its version and the oldest app that works with it. Asked once per address and
// again when the app comes back to the front (the server may have been updated meanwhile). An unreachable server says nothing.
type ServerInfo = { version: string | null; minApp: string | null; push: boolean };
const info = ref<ServerInfo | null>(null);
let asked: AbortController | null = null;

// Without an account the app does not talk to a server at all.
const local = useLocalMode();

function askServer() {
  asked?.abort();
  if (!local.loaded.value || local.on.value) return;
  const controller = (asked = new AbortController());
  fetch(`${url.value}/api/health/`, { signal: controller.signal })
    .then((res) => (res.ok ? res.json() : null))
    .then((body: { version?: string; min_app_version?: string; push?: boolean } | null) => {
      if (!controller.signal.aborted) info.value = body ? { version: body.version ?? null, minApp: body.min_app_version ?? null, push: body.push === true } : null;
    })
    .catch(() => {});
}
effectScope(true).run(() => {
  watch([url, local.loaded, local.on], () => ((info.value = null), askServer()), { immediate: true });
  void App.addListener('appStateChange', ({ isActive }) => isActive && askServer());
});

/** The version the server reports (null while unknown or when it cannot be reached). */
export function useServerVersion() {
  return computed(() => info.value?.version ?? null);
}

/** Whether the server can send push notifications (false while unknown). */
export function useServerPush() {
  return computed(() => info.value?.push === true);
}

/** Whether this app fits the server: 'ok', 'appTooOld' or 'serverOlder' (see lib/version.ts). */
export function useCompatibility() {
  return computed(() => compatibility(__APP_VERSION__, info.value?.version, info.value?.minApp));
}

export function useServerHealth() {
  const health = ref<HealthState>('checking');
  watchEffect((onCleanup) => {
    const address = url.value;
    const controller = new AbortController();
    health.value = 'checking';
    fetch(`${address}/api/health/`, { signal: controller.signal })
      .then((res) => {
        if (!controller.signal.aborted) health.value = res.ok ? 'ok' : 'unreachable';
      })
      .catch(() => {
        if (!controller.signal.aborted) health.value = 'unreachable';
      });
    onCleanup(() => controller.abort());
  });
  return health;
}
