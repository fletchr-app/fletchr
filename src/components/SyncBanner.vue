<script setup lang="ts">
import AppButton from '@/components/AppButton.vue'
import { useAuth } from '@/composables/useAuth'
import { useSyncStatus } from '@/composables/useSyncStatus'

// `list` is set on the `/sync` screen itself, which does not link to itself.
defineProps<{ list?: boolean }>()

const { isLocal } = useAuth()
const { waiting, failed, conflicts, wifiWaiting, kinds, retryFailed, discardFailed, log } = useSyncStatus()
</script>

<!-- Shows what has not reached the server yet. Nothing is lost while it waits: it is all saved on the device. -->
<template>
  <!-- Nothing is uploaded without an account, so nothing is waiting. -->
  <div v-if="!isLocal && (waiting > 0 || failed.length > 0 || conflicts.length > 0)" class="d-flex flex-column gap-2 p-3 rounded border">
    <div v-for="s in conflicts" :key="s.id" class="d-flex flex-column gap-2">
      <div class="text-danger">{{ $t('sync.gone', { date: new Date(s.started_at).toLocaleDateString() }) }}</div>
      <AppButton secondary @click="log.keepGoneAsNew(s.id)">{{ $t('sync.keepAsNew') }}</AppButton>
      <AppButton secondary @click="log.discardGone(s.id)">{{ $t('sync.discard') }}</AppButton>
    </div>
    <div v-if="waiting > 0">{{ $t('sync.waiting', { n: waiting }, waiting) }}</div>
    <div v-if="wifiWaiting > 0" class="muted small">{{ $t('sync.videosWaitForWifi', { n: wifiWaiting }, wifiWaiting) }}</div>
    <template v-if="failed.length > 0">
      <div class="text-danger">{{ $t('sync.failed', { n: failed.length, error: failed[0] }, failed.length) }}</div>
      <AppButton secondary @click="retryFailed">{{ $t('common.tryAgain') }}</AppButton>
      <AppButton secondary @click="discardFailed">{{ $t('sync.giveUp') }}</AppButton>
    </template>
    <a v-if="!list && kinds > 1" class="small" href="#" @click.prevent="$router.push('/sync')">{{ $t('sync.showList') }}</a>
  </div>
</template>
