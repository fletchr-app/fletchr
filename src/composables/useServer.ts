import { computed, ref, watchEffect } from 'vue';

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

/** The version the server reports (null while unknown or when it cannot be reached). */
export function useServerVersion() {
  const version = ref<string | null>(null);
  watchEffect((onCleanup) => {
    const address = url.value;
    const controller = new AbortController();
    version.value = null;
    fetch(`${address}/api/health/`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { version?: string } | null) => {
        if (!controller.signal.aborted) version.value = body?.version ?? null;
      })
      .catch(() => {});
    onCleanup(() => controller.abort());
  });
  return version;
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
