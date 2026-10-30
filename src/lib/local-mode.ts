// Using the app without an account or server (#93). Pure, with the storage passed in, so it can be tested.
// The id of the local owner is made once and kept for good: leaving local mode (by signing in) turns the flag off
// but keeps the id, so "use without an account" later finds the same data again.
export const LOCAL_MODE_KEY = 'local-mode';
export const LOCAL_OWNER_KEY = 'local-owner-id';

/** Id of the archer in notes and media of a person without an account (the server's ids start at 1). */
export const LOCAL_ARCHER = 0;

export type KeyValueStore = {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string) => Promise<void>;
  remove: (key: string) => Promise<void>;
};

export type LocalMode = { enabled: boolean; id: string | null };

export async function loadLocalMode(store: KeyValueStore): Promise<LocalMode> {
  const [flag, id] = await Promise.all([store.get(LOCAL_MODE_KEY), store.get(LOCAL_OWNER_KEY)]);
  return { enabled: flag === '1' && !!id, id: id || null };
}

/** Turn local mode on. Returns the owner id: the one made before, else a new one. */
export async function enableLocalMode(store: KeyValueStore, makeId: () => string): Promise<string> {
  const id = (await store.get(LOCAL_OWNER_KEY)) || makeId();
  await store.set(LOCAL_OWNER_KEY, id);
  await store.set(LOCAL_MODE_KEY, '1');
  return id;
}

/** Turn it off. The id stays, and so does all data under it. */
export async function disableLocalMode(store: KeyValueStore): Promise<void> {
  await store.remove(LOCAL_MODE_KEY);
}
