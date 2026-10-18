import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

// The local log holds sessions that have not reached the server yet. On a phone it goes into the
// platform's own key-value store (SharedPreferences, UserDefaults), because the OS may clear a
// WebView's localStorage when it is short of space. The browser uses localStorage.
const native = Capacitor.isNativePlatform();

export const localStore = {
  get: async (key: string): Promise<string | null> =>
    native ? (await Preferences.get({ key })).value : (globalThis.localStorage?.getItem(key) ?? null),
  set: async (key: string, value: string): Promise<void> => {
    if (native) await Preferences.set({ key, value });
    else globalThis.localStorage?.setItem(key, value);
  },
  remove: async (key: string): Promise<void> => {
    if (native) await Preferences.remove({ key });
    else globalThis.localStorage?.removeItem(key);
  },
};
