import { alertController } from '@ionic/vue'
import { ref } from 'vue'
import { useRouter } from 'vue-router'

import { useAuth } from '@/composables/useAuth'
import { errorMessage } from '@/lib/errors'

/** Asks for a name and creates a team with you as its admin; then opens the Team screen. */
export function useCreateTeam() {
  const router = useRouter()
  const { api } = useAuth()
  const error = ref<string | null>(null)

  async function create(name: string) {
    error.value = null
    try {
      const { data, error: failure } = await api.POST('/api/teams/', { body: { name } })
      if (data) void router.push('/team')
      else error.value = errorMessage(failure)
    } catch {
      error.value = 'Server not reachable'
    }
  }

  async function ask() {
    const alert = await alertController.create({
      header: 'Create a team',
      message: 'You become its admin. Then invite archers and coaches, or add archers who have no account yet.',
      inputs: [{ name: 'name', type: 'text', placeholder: 'Team name', attributes: { autocapitalize: 'words' } }],
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        { text: 'Create', handler: (value: { name?: string }) => !!value.name?.trim() && void create(value.name.trim()) },
      ],
    })
    await alert.present()
  }

  return { ask, error }
}
