import { ref } from 'vue';

import { disableLocalMode, enableLocalMode, loadLocalMode } from '@/lib/local-mode';
import { localStore } from '@/lib/local-store';
import { newId } from '@/lib/uuid';

// Whether the app is used without an account or server (#93): the flag and the owner id live on the device. A module of its
// own, because the server check (useServer) must stay quiet in local mode and useAuth builds on useServer.
const on = ref(false);
const id = ref<string | null>(null);
const loaded = ref(false);

void loadLocalMode(localStore)
  .then((mode) => {
    on.value = mode.enabled;
    id.value = mode.id;
  })
  .catch(() => {})
  .finally(() => (loaded.value = true));

export function useLocalMode() {
  return {
    on,
    id,
    loaded,
    /** Turn it on; data of an earlier local use comes back (the id is kept). */
    async enter() {
      id.value = await enableLocalMode(localStore, newId);
      on.value = true;
    },
    /** Turn it off, when an account is signed in. The id and the data stay. */
    async leave() {
      on.value = false;
      await disableLocalMode(localStore).catch(() => {});
    },
  };
}
