import { alertController } from '@ionic/vue'
import { ref } from 'vue'
import { useRouter } from 'vue-router'

import { useAuth } from '@/composables/useAuth'
import { t } from '@/i18n'
import { useTeams } from '@/composables/useTeams'
import { errorMessage } from '@/lib/errors'

/** Asks for a name and creates a team with you as its admin; then opens the Team screen. */
export function useCreateTeam() {
  const router = useRouter()
  const { api } = useAuth()
  const { load } = useTeams()
  const error = ref<string | null>(null)

  async function create(name: string) {
    error.value = null
    try {
      const { data, error: failure } = await api.POST('/api/teams/', { body: { name } })
      if (data) {
        await load() // the Team tab appears once I am an admin
        void router.push('/team')
      }
      else error.value = errorMessage(failure)
    } catch {
      error.value = t('common.serverNotReachable')
    }
  }

  async function ask() {
    const alert = await alertController.create({
      header: t('createTeam.header'),
      message: t('createTeam.message'),
      inputs: [{ name: 'name', type: 'text', placeholder: t('createTeam.placeholder'), attributes: { autocapitalize: 'words' } }],
      buttons: [
        { text: t('common.cancel'), role: 'cancel' },
        { text: t('createTeam.create'), handler: (value: { name?: string }) => !!value.name?.trim() && void create(value.name.trim()) },
      ],
    })
    await alert.present()
  }

  return { ask, error }
}
