import { type Ref, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import { useSchedule } from '@/composables/useSchedule'
import { type AgendaItem, fromLocalInput, toLocalInput } from '@/lib/schedule'

type Member = { user_id: number; name: string }

/** What a coach does to one training of the agenda: select it, move or cancel it, open it, add a note or media for an archer.
 * One training is selected at a time. A virtual occurrence is made a row first (`row`); `changed` reloads the agenda. */
export function useAgendaActions(members: Ref<readonly Member[] | null | undefined>, changed: () => void) {
  const { t } = useI18n()
  const router = useRouter()
  const { putEvent } = useSchedule()

  const selected = ref<AgendaItem | null>(null)
  const mode = ref<'' | 'move'>('')
  const error = ref<string | null>(null)
  const archer = ref('')
  const start = ref('')
  const end = ref('')
  const location = ref('')

  function select(item: AgendaItem) {
    selected.value = selected.value?.id === item.id ? null : item
    mode.value = ''
    error.value = null
    archer.value = ''
  }
  function startMove(item: AgendaItem) {
    start.value = toLocalInput(item.start)
    end.value = toLocalInput(item.end)
    location.value = item.location
    mode.value = 'move'
  }

  async function change(item: AgendaItem, changes: Parameters<typeof putEvent>[1]) {
    error.value = null
    const result = await putEvent(item, changes)
    if (!result.ok) return void (error.value = result.message)
    selected.value = null
    mode.value = ''
    changed()
  }
  const move = (item: AgendaItem) => {
    const [s, e] = [fromLocalInput(start.value), fromLocalInput(end.value)]
    if (!s || !e || e <= s) return void (error.value = t('schedule.endAfterStart'))
    return change(item, { start: s, end: e, location: location.value.trim() })
  }

  /** The training as a row: an occurrence nobody linked to is made one first. */
  async function row(item: AgendaItem): Promise<string | null> {
    if (!item.virtual) return item.id
    const result = await putEvent(item)
    if (!result.ok) {
      error.value = result.message
      return null
    }
    changed()
    return result.data.id
  }
  async function open(item: AgendaItem, path: (id: string) => string) {
    error.value = null
    const id = await row(item)
    if (id) void router.push(path(id))
  }
  const archerName = () => members.value?.find((m) => String(m.user_id) === archer.value)?.name ?? ''
  const addMedia = (item: AgendaItem) => {
    const slot = item.virtual ? `&slot=${item.slot}&date=${item.date}` : ''
    void router.push(`/media?owner=${archer.value}&name=${encodeURIComponent(archerName())}&event=${item.id}${slot}`)
  }

  return { selected, mode, error, archer, start, end, location, select, startMove, change, move, open, addMedia }
}
