import { computed, effectScope, ref, watch } from 'vue'

import { useAuth } from '@/composables/useAuth'
import type { components } from '@/lib/api-types'

type Team = components['schemas']['Team']

const { api, status } = useAuth()

// My teams with my role in each, kept for the whole app: the tab bar needs to know whether I coach.
const teams = ref<Team[]>([])
const loaded = ref(false)

/** Fetch again: when a screen is shown, and after creating, joining, leaving or deleting a team. */
async function load() {
  if (status.value !== 'signedIn') return
  try {
    const { data } = await api.GET('/api/teams/')
    if (data) {
      teams.value = data
      loaded.value = true
    }
  } catch {
    // Offline: keep what we have.
  }
}

/** A coach or admin of at least one team: the Team tab is for them. */
const isCoach = computed(() => teams.value.some((t) => t.my_role !== 'archer'))

effectScope(true).run(() =>
  watch(
    status,
    (s) => {
      if (s === 'signedIn') void load()
      else {
        teams.value = []
        loaded.value = false
      }
    },
    { immediate: true },
  ),
)

export function useTeams() {
  return { teams, loaded, isCoach, load }
}
