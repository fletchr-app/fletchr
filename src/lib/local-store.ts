import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Preferences } from '@capacitor/preferences';

import { createFileStore, type FileBackend, type FileStore } from './file-store.ts';

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

// The log, the media queue and other data that grows go into one file each (Directory.Data/stores), not into Preferences:
// there every key shares one SharedPreferences file that is rewritten on each save. A value still in Preferences moves
// to its file on the first read. The browser has no such problem and keeps using localStorage.
const FOLDER = 'stores';
const options = (name: string) => ({ path: `${FOLDER}/${name}`, directory: Directory.Data });

const filesystem: FileBackend = {
  read: async (name) => {
    try {
      const { data } = await Filesystem.readFile({ ...options(name), encoding: Encoding.UTF8 });
      return typeof data === 'string' ? data : await data.text();
    } catch {
      return null; // no such file
    }
  },
  write: async (name, data) => void (await Filesystem.writeFile({ ...options(name), data, encoding: Encoding.UTF8, recursive: true })),
  rename: async (from, to) => await Filesystem.rename({ from: `${FOLDER}/${from}`, to: `${FOLDER}/${to}`, directory: Directory.Data, toDirectory: Directory.Data }),
  remove: async (name) => await Filesystem.deleteFile(options(name)),
};

export const dataStore: FileStore = native ? createFileStore(filesystem, localStore) : localStore;
