// A key-value store of JSON strings kept in one file per key, for data that grows (the log, the media queue, later notes
// and equipment). On Android every Preferences key lives in one SharedPreferences file, so each save of the log rewrote
// the file that holds all the others. Free of Capacitor imports: the backends are passed in (see `local-store.ts`).

export type FileBackend = {
  /** The text of the file, or null if there is none. */
  read: (name: string) => Promise<string | null>;
  write: (name: string, data: string) => Promise<void>;
  /** Moves a file onto a name; the target may already exist. */
  rename: (from: string, to: string) => Promise<void>;
  remove: (name: string) => Promise<void>;
};

/** What the data was kept in before (Preferences). Read once, moved to a file, then removed. */
export type LegacyStore = {
  get: (key: string) => Promise<string | null>;
  remove: (key: string) => Promise<void>;
};

export type FileStore = {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string) => Promise<void>;
  remove: (key: string) => Promise<void>;
};

const fileName = (key: string) => `${encodeURIComponent(key)}.json`;
const tempName = (key: string) => `${fileName(key)}.tmp`;

export function createFileStore(backend: FileBackend, legacy: LegacyStore): FileStore {
  // One write at a time per key, and only the newest value is written: a burst of changes costs one file write.
  const chains = new Map<string, Promise<void>>();
  const latest = new Map<string, string>();

  const queue = (key: string, task: () => Promise<void>) => {
    const next = (chains.get(key) ?? Promise.resolve()).catch(() => {}).then(task);
    chains.set(key, next);
    return next;
  };

  async function write(key: string, value: string) {
    // Write the whole new file beside the old one, then move it over. A crash leaves the old file or the complete new one.
    await backend.write(tempName(key), value);
    try {
      await backend.rename(tempName(key), fileName(key));
    } catch {
      // Some platforms refuse to rename onto an existing file. The complete temp file stays until the rename worked, and `get` reads it.
      await backend.remove(fileName(key));
      await backend.rename(tempName(key), fileName(key));
    }
  }

  return {
    async get(key) {
      // A queued write is newer than anything on disk.
      const pending = latest.get(key);
      if (pending !== undefined) return pending;
      const stored = (await backend.read(fileName(key))) ?? (await backend.read(tempName(key)));
      if (stored !== null) return stored;
      const old = await legacy.get(key);
      if (old === null) return null;
      // The old value is removed only after the file has been written and read back.
      await queue(key, () => backend.write(fileName(key), old));
      if ((await backend.read(fileName(key))) === old) await legacy.remove(key);
      return old;
    },
    set(key, value) {
      latest.set(key, value);
      return queue(key, async () => {
        const v = latest.get(key);
        if (v === undefined) return; // a later task already wrote the newest value
        latest.delete(key);
        await write(key, v);
      });
    },
    remove(key) {
      latest.delete(key);
      return queue(key, async () => {
        await backend.remove(fileName(key)).catch(() => {});
        await backend.remove(tempName(key)).catch(() => {});
        await legacy.remove(key);
      });
    },
  };
}
