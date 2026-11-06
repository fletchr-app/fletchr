import { computed } from 'vue'

import { useScheduleCache } from '@/composables/useScheduleCache'
import { suggestEvents } from '@/lib/schedule'

// What is on in your teams from a month back to three months ahead, for the screens that suggest a training for a
// session, note or photo. Read from the copy on the phone, so the suggestions work without a connection (#104, phase 6).
const cache = useScheduleCache()
const items = computed(() => cache.state.value.agenda)
const loaded = computed(() => cache.state.value.pulledAt !== null)

export function useAgenda() {
  /** The trainings to offer for a time or a span; the screens hide the choice when this is empty. */
  const suggest = (start: Date | string, end?: Date | string | null, options?: Parameters<typeof suggestEvents>[3]) => suggestEvents(items.value, start, end, options)
  /** Fetch again unless the copy is fresh; `force` after the schedule changed. */
  const load = (force = false) => cache.pull(force)
  return { items, loaded, load, suggest }
}
