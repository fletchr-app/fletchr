import { ref, watch } from 'vue'

import { useAuth } from '@/composables/useAuth'
import { errorMessage } from '@/lib/errors'

// Who sees my name and picture in the team (account only, kept on the server). `null` until the server has said, and for an older server
// that does not know the setting: the screen then hides it, a saved choice would be lost quietly.
export type ProfileVisibility = 'team' | 'coaches' | 'me'
export const PROFILE_VISIBILITIES: ProfileVisibility[] = ['team', 'coaches', 'me']

const visibility = ref<ProfileVisibility | null>(null)
const error = ref('')
let started = false

function isProfileVisibility(value: unknown): value is ProfileVisibility {
  return PROFILE_VISIBILITIES.includes(value as ProfileVisibility)
}

export function useProfileVisibility() {
  const { api, status } = useAuth()

  async function sync() {
    try {
      const { data } = await api.GET('/api/me/')
      visibility.value = isProfileVisibility(data?.profile.visibility) ? data.profile.visibility : null
    } catch {
      // Offline: what was read stays.
    }
  }

  /** Needs a connection. Nothing changes when the server refuses. */
  async function save(next: ProfileVisibility) {
    error.value = ''
    try {
      const { data, error: failure } = await api.PATCH('/api/me/', { body: { profile: { visibility: next } } })
      if (data) visibility.value = next
      else error.value = errorMessage(failure)
    } catch {
      error.value = errorMessage(undefined)
    }
  }

  if (!started) {
    started = true
    watch(
      status,
      (s) => {
        if (s === 'signedIn') void sync()
        else visibility.value = null
      },
      { immediate: true },
    )
  }

  return { visibility, error, save }
}
