import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

export type Tokens = { access: string; refresh: string };

// Keychain/Keystore on devices. expo-secure-store has no web support, so the
// browser falls back to localStorage (readable by any script on the page).
const store = {
  get: (key: string) =>
    Platform.OS === 'web' ? Promise.resolve(globalThis.localStorage?.getItem(key) ?? null) : SecureStore.getItemAsync(key),
  set: async (key: string, value: string) => {
    if (Platform.OS === 'web') globalThis.localStorage?.setItem(key, value);
    else await SecureStore.setItemAsync(key, value);
  },
  remove: async (key: string) => {
    if (Platform.OS === 'web') globalThis.localStorage?.removeItem(key);
    else await SecureStore.deleteItemAsync(key);
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
