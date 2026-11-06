import { ref } from 'vue'

import { useAuth } from '@/composables/useAuth'
import { useMedia } from '@/composables/useMedia'
import { useTrainingVisibility } from '@/composables/useTrainingVisibility'
import { isVisibility, type Visibility } from '@/lib/log-model'
import { t } from '@/i18n'

/**
 * Who sees a photo or clip that is in no session (a clip in a session follows the session). The owner changes it at any time:
 * a clip that is still queued on the phone changes in the queue, one on the server is sent there (needs a connection).
 * A clip without a value of its own shows the archer's default from Settings.
 */
export function useClipVisibility() {
  const { api } = useAuth()
  const media = useMedia()
  const { visibility: fallback } = useTrainingVisibility()
  const error = ref('')
  // What was chosen on this screen, so the choice shows before the list is loaded again.
  const chosen = ref<Record<string, Visibility>>({})

  const effective = (id: string, own: unknown): Visibility => chosen.value[id] ?? (isVisibility(own) ? own : fallback.value)

  async function save(target: { id: string; queued: boolean }, value: Visibility): Promise<void> {
    error.value = ''
    if (target.queued) {
      media.setVisibility(target.id, value)
      chosen.value = { ...chosen.value, [target.id]: value }
      return
    }
    try {
      const { response } = await api.PUT('/api/media/{media_id}/', {
        params: { path: { media_id: target.id } },
        body: {},
        bodySerializer: () => {
          const form = new FormData()
          form.append('visibility', value)
          return form
        },
      })
      if (response.ok) chosen.value = { ...chosen.value, [target.id]: value }
      else error.value = t('visibility.clipFailed')
    } catch {
      error.value = t('visibility.clipFailed')
    }
  }

  return { error, effective, save }
}
