import { computed, effectScope, ref, watch } from 'vue'

import { useAuth } from '@/composables/useAuth'
import { type AgendaItem, suggestEvents } from '@/lib/schedule'

// What is on in your teams from yesterday to eight weeks ahead, kept for the screens that suggest a training for a
// session, note or photo. Only with a connection: without one nothing is suggested (offline schedule: #104, phase 6).
const DAY_MS = 86_400_000
const AHEAD_DAYS = 56
const MAX_AGE_MS = 5 * 60_000

const { api, status } = useAuth()

const items = ref<AgendaItem[]>([])
const loaded = ref(false)
let fetchedAt = 0

/** Fetch again unless the copy is fresh; `force` after the schedule changed. */
async function load(force = false) {
  if (status.value !== 'signedIn' || (!force && Date.now() - fetchedAt < MAX_AGE_MS)) return
  fetchedAt = Date.now()
  const from = new Date(Date.now() - DAY_MS)
  try {
    const { data } = await api.GET('/api/events/agenda/', { params: { query: { from: from.toISOString(), to: new Date(from.getTime() + AHEAD_DAYS * DAY_MS).toISOString() } } })
    if (data) {
      items.value = data
      loaded.value = true
    } else fetchedAt = 0
  } catch {
    fetchedAt = 0 // offline: keep what we have, try again next time
  }
}

effectScope(true).run(() =>
  watch(
    status,
    (s) => {
      if (s === 'signedIn') void load(true)
      else {
        items.value = []
        loaded.value = false
        fetchedAt = 0
      }
    },
    { immediate: true },
  ),
)

export function useAgenda() {
  /** The trainings to offer for a time or a span; the screens hide the choice when this is empty. */
  const suggest = (start: Date | string, end?: Date | string | null, options?: Parameters<typeof suggestEvents>[3]) => suggestEvents(items.value, start, end, options)
  return { items: computed(() => items.value), loaded, load, suggest }
}
