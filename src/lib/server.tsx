import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useContext, useEffect, useState } from 'react';

// Default server address comes from EXPO_PUBLIC_SERVER_URL (.env), so one
// build can point at a local server or the VPS. Users can override it in
// Settings; the override is stored on the device.
export const DEFAULT_SERVER_URL =
  process.env.EXPO_PUBLIC_SERVER_URL ?? 'http://localhost:8080';

const STORAGE_KEY = 'serverUrl';

type ServerContextValue = {
  url: string;
  isOverride: boolean;
  setUrl: (url: string | null) => Promise<void>;
};

const ServerContext = createContext<ServerContextValue | null>(null);

export function normaliseUrl(url: string) {
  return url.trim().replace(/\/+$/, '');
}

export function ServerProvider({ children }: { children: ReactNode }) {
  const [override, setOverride] = useState<string | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(setOverride).catch(() => {});
  }, []);

  const url = override ?? DEFAULT_SERVER_URL;

  async function setUrl(next: string | null) {
    if (next === null || normaliseUrl(next) === '') {
      await AsyncStorage.removeItem(STORAGE_KEY);
      setOverride(null);
    } else {
      const value = normaliseUrl(next);
      await AsyncStorage.setItem(STORAGE_KEY, value);
      setOverride(value);
    }
  }

  return (
    <ServerContext.Provider value={{ url, isOverride: override !== null, setUrl }}>
      {children}
    </ServerContext.Provider>
  );
}

export function useServer() {
  const ctx = useContext(ServerContext);
  if (!ctx) throw new Error('useServer must be used inside ServerProvider');
  return ctx;
}

export type HealthState = 'checking' | 'ok' | 'unreachable';

export function useServerHealth(): HealthState {
  const { url } = useServer();
  const [result, setResult] = useState<{ url: string; ok: boolean } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${url}/api/health/`, { signal: controller.signal })
      .then((res) => setResult({ url, ok: res.ok }))
      .catch(() => !controller.signal.aborted && setResult({ url, ok: false }));
    return () => controller.abort();
  }, [url]);

  // A result for a previous server address counts as still checking.
  if (result?.url !== url) return 'checking';
  return result.ok ? 'ok' : 'unreachable';
}
