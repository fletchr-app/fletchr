import { useAgenda } from '@/composables/useAgenda'
import { useAuth } from '@/composables/useAuth'
import { useDeviceCalendar } from '@/composables/useDeviceCalendar'
import { t } from '@/i18n'
import type { components } from '@/lib/api-types'
import { errorMessage } from '@/lib/errors'
import { type AgendaItem, itemKey } from '@/lib/schedule'
import { newId } from '@/lib/uuid'

export type EventChanges = Partial<Pick<components['schemas']['EventWriteRequest'], 'kind' | 'name' | 'start' | 'end' | 'location' | 'time_zone' | 'cancelled'>>
export type SlotValues = Omit<components['schemas']['SlotRequest'], 'team'>
type Outcome<T> = { ok: true; data: T } | { ok: false; message: string; status: number }

/** Changing the schedule of a team (coaches). Online only: every call says what went wrong in words, or gives what the server answered. */
export function useSchedule() {
  const { api } = useAuth()
  const agenda = useAgenda()
  const deviceCalendar = useDeviceCalendar()

  /** After a write that went through: the suggestions and the phone's calendar follow. */
  const changed = () => {
    void agenda.load(true)
    void deviceCalendar.sync(true)
  }

  async function run<T>(call: () => Promise<{ data?: T; error?: unknown; response: Response }>): Promise<Outcome<T>> {
    try {
      const { data, error, response } = await call()
      if (response.ok && data !== undefined) return { ok: true, data }
      if (response.ok) return { ok: true, data: undefined as T }
      // A 409 comes with the text to show, e.g. why a training cannot be cancelled
      const detail = (error as { detail?: string } | undefined)?.detail
      return { ok: false, message: detail ?? errorMessage(error), status: response.status }
    } catch {
      return { ok: false, message: t('common.serverNotReachable'), status: 0 }
    }
  }

  /** Make a training a row (when it is the occurrence of a slot), and change it: cancel, move, rename. */
  async function putEvent(item: AgendaItem, changes: EventChanges = {}) {
    const result = await run(() =>
      api.PUT('/api/events/{event_id}/', { params: { path: { event_id: item.id } }, body: { ...itemKey(item), ...changes } }),
    )
    if (result.ok) changed()
    return result
  }

  /** A one-off: a competition, an extra training or a camp. */
  async function addEvent(team: number, values: Required<Pick<EventChanges, 'kind' | 'start' | 'end'>> & EventChanges) {
    const result = await run(() =>
      api.PUT('/api/events/{event_id}/', { params: { path: { event_id: newId() } }, body: { team, time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone, ...values } }),
    )
    if (result.ok) changed()
    return result
  }

  async function deleteEvent(id: string) {
    const result = await run(() => api.DELETE('/api/events/{event_id}/', { params: { path: { event_id: id } } }))
    if (result.ok) changed()
    return result
  }

  /** Create (`id` null) or change a slot. A 409 says the times can no longer change in place. */
  async function putSlot(team: number, id: string | null, values: Partial<SlotValues>) {
    const result = await run(() =>
      api.PUT('/api/slots/{slot_id}/', { params: { path: { slot_id: id ?? newId() } }, body: { team, ...values } as components['schemas']['SlotRequest'] }),
    )
    if (result.ok) changed()
    return result
  }

  async function deleteSlot(id: string) {
    const result = await run(() => api.DELETE('/api/slots/{slot_id}/', { params: { path: { slot_id: id } } }))
    if (result.ok) changed()
    return result
  }

  return { putEvent, addEvent, deleteEvent, putSlot, deleteSlot }
}
