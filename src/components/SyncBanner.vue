<script setup lang="ts">
import AppButton from '@/components/AppButton.vue'
import { useLog } from '@/composables/useLog'

const { waiting, failed, retryFailed, discardFailed } = useLog()
</script>

<!-- Shows what has not reached the server yet. Nothing is lost while it waits: it is all saved on the device. -->
<template>
  <div v-if="waiting > 0 || failed.length > 0" class="d-flex flex-column gap-2 p-3 rounded border">
    <div v-if="waiting > 0">{{ $t('sync.waiting', { n: waiting }, waiting) }}</div>
    <template v-if="failed.length > 0">
      <div class="text-danger">{{ $t('sync.failed', { n: failed.length, error: failed[0]!.error }, failed.length) }}</div>
      <AppButton secondary @click="retryFailed">{{ $t('common.tryAgain') }}</AppButton>
      <AppButton secondary @click="discardFailed">{{ $t('sync.giveUp') }}</AppButton>
    </template>
  </div>
</template>
