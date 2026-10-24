<script setup lang="ts">
import { computed } from 'vue'

import AppButton from '@/components/AppButton.vue'
import { useLog } from '@/composables/useLog'
import { useMedia } from '@/composables/useMedia'

const log = useLog()
const media = useMedia()
const waiting = computed(() => log.waiting.value + media.waiting.value.length)
const failed = computed(() => [...log.failed.value.map((o) => o.error), ...media.failed.value.map((m) => m.error)])
const retryFailed = () => (log.retryFailed(), media.retryFailed())
const discardFailed = () => (log.discardFailed(), media.discardFailed())
</script>

<!-- Shows what has not reached the server yet. Nothing is lost while it waits: it is all saved on the device. -->
<template>
  <div v-if="waiting > 0 || failed.length > 0" class="d-flex flex-column gap-2 p-3 rounded border">
    <div v-if="waiting > 0">{{ $t('sync.waiting', { n: waiting }, waiting) }}</div>
    <template v-if="failed.length > 0">
      <div class="text-danger">{{ $t('sync.failed', { n: failed.length, error: failed[0] }, failed.length) }}</div>
      <AppButton secondary @click="retryFailed">{{ $t('common.tryAgain') }}</AppButton>
      <AppButton secondary @click="discardFailed">{{ $t('sync.giveUp') }}</AppButton>
    </template>
  </div>
</template>
