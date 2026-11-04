import { computed } from 'vue'

import { useAuth } from '@/composables/useAuth'
import { useLog } from '@/composables/useLog'
import { useRemote } from '@/composables/useRemote'
import { sessionRows } from '@/lib/session-rows'

const REFRESH_MS = 10000

/** The sessions of one archer, newest first: those a coach logged on this device (editable), then those the server has. */
export function useArcherSessions(archerId: number) {
  const { api } = useAuth()
  const { sessions: local, goneSessions } = useLog()
  const sessions = useRemote(async () => (await api.GET('/api/sessions/', { params: { query: { owner: archerId } } })).data ?? null, {
    pollMs: REFRESH_MS,
    keepPolling: () => true,
  })
  const events = useRemote(async () => (await api.GET('/api/events/mine/', { params: { query: { archer: archerId } } })).data ?? null, {
    pollMs: REFRESH_MS,
    keepPolling: () => true,
  })
  const rows = computed(() => sessionRows(local.value.filter((s) => s.owner === archerId), sessions.data.value ?? [], goneSessions.value, events.data.value ?? [], archerId))
  return { rows, error: sessions.error, loading: sessions.loading }
}
