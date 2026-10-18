import { Capacitor } from '@capacitor/core';
import { SecureStorage } from '@aparajita/capacitor-secure-storage';

export type Tokens = { access: string; refresh: string };

// Keychain/Keystore on devices. The browser falls back to localStorage (readable by any script on the page).
const native = Capacitor.isNativePlatform();
const store = {
  get: async (key: string) =>
    native ? ((await SecureStorage.get(key)) as string | null) : (globalThis.localStorage?.getItem(key) ?? null),
  set: async (key: string, value: string) => {
    if (native) await SecureStorage.set(key, value);
    else globalThis.localStorage?.setItem(key, value);
  },
  remove: async (key: string) => {
    if (native) await SecureStorage.remove(key);
    else globalThis.localStorage?.removeItem(key);
  },
};

// Tokens are stored with the server they were issued by, and ignored for any other server.
const KEYS = { access: 'auth.access', refresh: 'auth.refresh', server: 'auth.server' };

export async function loadTokens(serverUrl: string): Promise<Tokens | null> {
  try {
    const [access, refresh, server] = await Promise.all([
      store.get(KEYS.access),
      store.get(KEYS.refresh),
      store.get(KEYS.server),
    ]);
    return access && refresh && server === serverUrl ? { access, refresh } : null;
  } catch {
    return null;
  }
}

export async function saveTokens(serverUrl: string, tokens: Tokens | null) {
  try {
    if (tokens) {
      await Promise.all([
        store.set(KEYS.access, tokens.access),
        store.set(KEYS.refresh, tokens.refresh),
        store.set(KEYS.server, serverUrl),
      ]);
    } else {
      await Promise.all(Object.values(KEYS).map(store.remove));
    }
  } catch {
    // Storage failed: the user stays signed in for this session only.
  }
}
