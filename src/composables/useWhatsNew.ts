import { computed, ref } from 'vue'

import { currentLanguage } from '@/i18n'
import { localStore } from '@/lib/local-store'
import { entriesUpTo, unseenEntries, type WhatsNewEntry } from '@/lib/whats-new'
import { WHATS_NEW } from '@/locales/whats-new'

// "What's new" after an update: the entries since the version seen last, shown once. The version seen last is kept
// on the device. Without it, any other stored setting means the app was used before (an update from a version
// without this feature); none at all means a fresh install, which shows nothing.
const KEY = 'whats_new_seen'
const APP_VERSION = __APP_VERSION__

const pending = ref<WhatsNewEntry[]>([])
let started = false

async function check() {
  const seen = await localStore.get(KEY)
  const earlierUse = seen === null && (await localStore.keys()).length > 0
  pending.value = unseenEntries(WHATS_NEW, seen, APP_VERSION, earlierUse)
  if (pending.value.length === 0 && seen !== APP_VERSION) await localStore.set(KEY, APP_VERSION)
}

/** The points of an entry in the app's language. */
export const pointsOf = (entry: WhatsNewEntry) => (currentLanguage() === 'de' ? entry.de : entry.en)

export function useWhatsNew() {
  if (!started) {
    started = true
    void check()
  }
  return {
    pending,
    all: computed(() => entriesUpTo(WHATS_NEW, APP_VERSION)),
    dismiss() {
      pending.value = []
      void localStore.set(KEY, APP_VERSION)
    },
  }
}
