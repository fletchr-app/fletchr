import { computed } from 'vue'

import { useScheduleCache } from '@/composables/useScheduleCache'

// My teams with my role in each, kept for the whole app: the tab bar needs to know whether I coach. Read from the copy on
// the phone (`useScheduleCache`), so the Team tab lists them without a connection.
const cache = useScheduleCache()
const teams = computed(() => cache.state.value.teams)
const loaded = computed(() => cache.state.value.pulledAt !== null)

/** A coach or admin of at least one team: the Team tab is for them. */
const isCoach = computed(() => teams.value.some((t) => t.my_role !== 'archer'))

/** Fetch again: `force` (the default) after creating, joining, leaving or deleting a team; without it only when the copy is old. */
const load = (force = true) => cache.pull(force)

export function useTeams() {
  return { teams, loaded, isCoach, load }
}
