import { computed } from 'vue'

import { useEquipment } from '@/composables/useEquipment'
import { useEvaluations } from '@/composables/useEvaluations'
import { useLog } from '@/composables/useLog'
import { useMedia } from '@/composables/useMedia'
import { useNotes } from '@/composables/useNotes'

export type SyncKind = 'log' | 'media' | 'equipment' | 'notes' | 'evaluations'

/** What has not reached the server yet, per queue, for `SyncBanner` and the `/sync` list. */
export function useSyncStatus() {
  const log = useLog()
  const media = useMedia()
  const equipment = useEquipment()
  const notes = useNotes()
  const evaluations = useEvaluations()
  const rows = computed<{ kind: SyncKind; waiting: number; failed: string[] }[]>(() => [
    { kind: 'log', waiting: log.waiting.value, failed: log.failed.value.map((o) => o.error!) },
    { kind: 'media', waiting: media.waiting.value.length, failed: media.failed.value.map((m) => m.error!) },
    { kind: 'equipment', waiting: equipment.waiting.value, failed: equipment.failed.value.map((o) => o.error!) },
    { kind: 'notes', waiting: notes.waiting.value, failed: notes.failed.value.map((n) => n.error!) },
    { kind: 'evaluations', waiting: evaluations.waiting.value, failed: evaluations.failed.value.map((e) => e.error!) },
  ])
  const waiting = computed(() => rows.value.reduce((n, r) => n + r.waiting, 0))
  const failed = computed(() => rows.value.flatMap((r) => r.failed))
  const conflicts = log.conflicts
  // Videos held back for Wi-Fi: after the upload of local data they would otherwise wait unseen.
  const wifiWaiting = computed(() => media.waitingForWifi())
  // Kinds with something to show: the list is only worth opening when there is more than one.
  const kinds = computed(() => rows.value.filter((r) => r.waiting > 0 || r.failed.length > 0).length + (conflicts.value.length > 0 ? 1 : 0))
  const retryFailed = () => (log.retryFailed(), media.retryFailed(), equipment.retryFailed(), notes.retryFailed(), evaluations.retryFailed())
  const discardFailed = () => (log.discardFailed(), media.discardFailed(), equipment.discardFailed(), notes.discardFailed(), evaluations.discardFailed())
  return { rows, waiting, failed, conflicts, wifiWaiting, kinds, retryFailed, discardFailed, log }
}
