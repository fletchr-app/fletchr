import { ref, watch } from 'vue'

import { useAuth } from '@/composables/useAuth'
import { errorMessage } from '@/lib/errors'
import { isVisibility, type Visibility } from '@/lib/log-model'
import { localStore } from '@/lib/local-store'

// The archer's default for who sees a new session (account only, kept on the server). The last value is kept on the device, so lists and
// the session screen can say what a session without a choice will get; it is read again whenever someone signs in.
const KEY = 'trainingVisibility'
const visibility = ref<Visibility>('coaches')
const error = ref('')
let started = false

export function useTrainingVisibility() {
  const { api, status } = useAuth()

  function remember(next: Visibility) {
    visibility.value = next
    void localStore.set(KEY, next)
  }

  async function sync() {
    try {
      const { data } = await api.GET('/api/me/')
      if (data && isVisibility(data.profile.training_visibility)) remember(data.profile.training_visibility)
    } catch {
      // Offline: the saved value stays.
    }
  }

  /** Needs a connection: the server is the one that applies it to new sessions. Nothing changes when it is refused. */
  async function save(next: Visibility) {
    error.value = ''
    try {
      const { data, error: failure } = await api.PATCH('/api/me/', { body: { profile: { training_visibility: next } } })
      if (data) remember(next)
      else error.value = errorMessage(failure)
    } catch {
      error.value = errorMessage(undefined)
    }
  }

  if (!started) {
    started = true
    void localStore.get(KEY).then((saved) => {
      if (isVisibility(saved)) visibility.value = saved
    })
    watch(status, (s) => s === 'signedIn' && void sync(), { immediate: true })
  }

  return { visibility, error, save }
}
