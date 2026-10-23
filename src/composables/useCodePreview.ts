import { ref } from 'vue'

import { useAuth } from '@/composables/useAuth'
import type { components } from '@/lib/api-types'
import { t } from '@/i18n'
import { errorMessage } from '@/lib/errors'

export type CodePreview = components['schemas']['CodePreview']

/** What a code does (join a team, or take over a profile a coach keeps for you), so it can be confirmed first. */
export function useCodePreview() {
  const { api } = useAuth()
  const preview = ref<CodePreview | null>(null)

  /** The preview, or the reason there is none. */
  async function check(code: string): Promise<{ preview: CodePreview } | { error: string }> {
    try {
      const { data, error } = await api.POST('/api/codes/preview/', { body: { invite_code: code.trim() } })
      if (!data) return { error: errorMessage(error) }
      preview.value = data
      return { preview: data }
    } catch {
      return { error: t('common.serverNotReachable') }
    }
  }

  return { preview, check }
}
