<script setup lang="ts">
import { computed } from 'vue'

import AppButton from '@/components/AppButton.vue'
import { useEquipment } from '@/composables/useEquipment'
import { useLog } from '@/composables/useLog'
import { useMedia } from '@/composables/useMedia'
import { useNotes } from '@/composables/useNotes'

const log = useLog()
const media = useMedia()
const equipment = useEquipment()
const notes = useNotes()
const conflicts = log.conflicts
const waiting = computed(() => log.waiting.value + media.waiting.value.length + equipment.waiting.value + notes.waiting.value)
const failed = computed(() => [
  ...log.failed.value.map((o) => o.error),
  ...media.failed.value.map((m) => m.error),
  ...equipment.failed.value.map((o) => o.error),
  ...notes.failed.value.map((n) => n.error),
])
const retryFailed = () => (log.retryFailed(), media.retryFailed(), equipment.retryFailed(), notes.retryFailed())
const discardFailed = () => (log.discardFailed(), media.discardFailed(), equipment.discardFailed(), notes.discardFailed())
</script>

<!-- Shows what has not reached the server yet. Nothing is lost while it waits: it is all saved on the device. -->
<template>
  <div v-if="waiting > 0 || failed.length > 0 || conflicts.length > 0" class="d-flex flex-column gap-2 p-3 rounded border">
    <div v-for="s in conflicts" :key="s.id" class="d-flex flex-column gap-2">
      <div class="text-danger">{{ $t('sync.gone', { date: new Date(s.started_at).toLocaleDateString() }) }}</div>
      <AppButton secondary @click="log.keepGoneAsNew(s.id)">{{ $t('sync.keepAsNew') }}</AppButton>
      <AppButton secondary @click="log.discardGone(s.id)">{{ $t('sync.discard') }}</AppButton>
    </div>
    <div v-if="waiting > 0">{{ $t('sync.waiting', { n: waiting }, waiting) }}</div>
    <template v-if="failed.length > 0">
      <div class="text-danger">{{ $t('sync.failed', { n: failed.length, error: failed[0] }, failed.length) }}</div>
      <AppButton secondary @click="retryFailed">{{ $t('common.tryAgain') }}</AppButton>
      <AppButton secondary @click="discardFailed">{{ $t('sync.giveUp') }}</AppButton>
    </template>
  </div>
</template>
