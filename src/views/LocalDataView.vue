<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import AppButton from '@/components/AppButton.vue'
import AppPage from '@/components/AppPage.vue'
import ErrorText from '@/components/ErrorText.vue'
import { useEquipment } from '@/composables/useEquipment'
import { useLog } from '@/composables/useLog'
import { useMedia } from '@/composables/useMedia'
import { useNotes } from '@/composables/useNotes'
import { saveJson } from '@/lib/export-file'
import { buildExport, type ImportPlan, type LocalData, parseExport, planImport } from '@/lib/local-export'

// Without an account the phone holds the only copy, so this is the backup: a JSON file with the sessions, equipment and
// notes (with drawings). Photos and videos are not in it. Importing adds what this phone does not have.
const { t } = useI18n()
const log = useLog()
const equipment = useEquipment()
const notes = useNotes()
const media = useMedia()
const APP_VERSION = __APP_VERSION__

const error = ref<string | null>(null)
const message = ref<string | null>(null)
const busy = ref(false)
const picker = ref<HTMLInputElement | null>(null)
const counts = computed(() => ({ sessions: log.sessions.value.length, notes: notes.notes.value.length, media: media.items.value.length }))
const device = (): LocalData => ({ sessions: log.sessions.value, equipment: equipment.allItems(), notes: notes.notes.value })

async function exportAll() {
  error.value = message.value = null
  busy.value = true
  try {
    const file = buildExport(device(), media.items.value.length, APP_VERSION, new Date())
    await saveJson(`fletchr-local-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(file, null, 2))
    message.value = t('local.exported')
  } catch (e) {
    error.value = e instanceof Error && e.message.startsWith('Sharing') ? t('privacy.sharingUnavailable') : t('local.exportFailed')
  }
  busy.value = false
}

const summary = (plan: ImportPlan) => {
  const kept = plan.kept.sessions + plan.kept.equipment + plan.kept.notes
  const added = t('local.imported', {
    sessions: t('local.n.sessions', plan.added.sessions),
    equipment: t('local.n.equipment', plan.added.equipment),
    notes: t('local.n.notes', plan.added.notes),
  })
  return kept > 0 ? `${added} ${t('local.importedKept', kept)}` : added
}

async function importFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = '' // the same file can be chosen again
  if (!file) return
  error.value = message.value = null
  const parsed = parseExport(await file.text().catch(() => ''))
  if (!parsed.ok) {
    error.value = t(`local.import.${parsed.reason}`)
    return
  }
  const plan = planImport(parsed.data, device())
  log.importSessions(plan.add.sessions)
  equipment.importItems(plan.add.equipment)
  notes.importNotes(plan.add.notes)
  message.value = summary(plan)
}
</script>

<template>
  <AppPage :title="$t('local.dataTitle')">
    <div class="screen">
      <section class="d-flex flex-column gap-2">
        <h2 class="h5 m-0">{{ $t('local.onThisPhone') }}</h2>
        <p class="m-0">{{ $t('local.onThisPhoneText', { sessions: $t('local.n.sessions', counts.sessions), notes: $t('local.n.notes', counts.notes), media: $t('local.n.media', counts.media) }) }}</p>
        <p class="m-0">{{ $t('local.noCopy') }}</p>
      </section>
      <section class="d-flex flex-column gap-2">
        <h2 class="h5 m-0">{{ $t('local.exportTitle') }}</h2>
        <p class="m-0">{{ $t('local.exportText') }}</p>
        <p class="m-0">{{ $t('local.exportMedia') }}</p>
        <AppButton :busy="busy" @click="exportAll">{{ $t('local.exportButton') }}</AppButton>
      </section>
      <section class="d-flex flex-column gap-2">
        <h2 class="h5 m-0">{{ $t('local.importTitle') }}</h2>
        <p class="m-0">{{ $t('local.importText') }}</p>
        <input ref="picker" type="file" accept="application/json,.json" hidden @change="importFile" />
        <AppButton secondary @click="picker?.click()">{{ $t('local.importButton') }}</AppButton>
      </section>
      <ErrorText :message="error" />
      <div v-if="message" class="fw-semibold">{{ message }}</div>
    </div>
  </AppPage>
</template>
