import { App } from '@capacitor/app';
import { computed, effectScope, ref, watch, watchEffect } from 'vue';

import { useLocalMode } from '@/composables/useLocalMode';
import { compatibility } from '@/lib/version';

// Default server address comes from VITE_SERVER_URL (.env), so one build can point at a local server
// or the VPS. Users can override it in Settings; the override is stored on the device.
export const DEFAULT_SERVER_URL = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:8080';

const STORAGE_KEY = 'serverUrl';

export function normaliseUrl(url: string) {
  return url.trim().replace(/\/+$/, '');
}

function readOverride(): string | null {
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY) ?? null;
  } catch {
    return null;
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

// What the server says about itself: its version and the oldest app that works with it. Asked once per address and
// again when the app comes back to the front (the server may have been updated meanwhile). An unreachable server says nothing.
type ServerInfo = { version: string | null; minApp: string | null };
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
    .then((body: { version?: string; min_app_version?: string } | null) => {
      if (!controller.signal.aborted) info.value = body ? { version: body.version ?? null, minApp: body.min_app_version ?? null } : null;
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
