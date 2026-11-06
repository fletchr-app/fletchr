<script setup lang="ts">
import { alertController } from '@ionic/vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import { useAuth } from '@/composables/useAuth'
import { useConnection } from '@/composables/useConnection'
import { useSyncStatus } from '@/composables/useSyncStatus'

// Signed in, but the server cannot be reached: one red line under the app bar of every screen, until it can. A tap opens the details:
// what it means and what is waiting to upload. Without an account the app does not use a server, so there is nothing to report.
const { t } = useI18n()
const router = useRouter()
const { status } = useAuth()
const { reachable } = useConnection()
const { waiting, failed } = useSyncStatus()

async function showDetails() {
  const lines = [t('connection.explain')]
  if (waiting.value > 0) lines.push(t('sync.waiting', { n: waiting.value }, waiting.value))
  if (failed.value.length > 0) lines.push(t('sync.failed', { n: failed.value.length, error: failed.value[0] }, failed.value.length))
  if (waiting.value === 0 && failed.value.length === 0) lines.push(t('connection.nothingWaiting'))
  const alert = await alertController.create({
    header: t('common.serverNotReachable'),
    message: lines.join('\n\n'),
    cssClass: 'connection-details', // keeps the line breaks (src/assets/main.css)
    buttons: [
      ...(waiting.value > 0 || failed.value.length > 0 ? [{ text: t('connection.showList'), handler: () => void router.push('/sync') }] : []),
      { text: t('common.close'), role: 'cancel' },
    ],
  })
  await alert.present()
}
</script>

<template>
  <button v-if="status === 'signedIn' && !reachable" type="button" class="connection-banner" role="alert" @click="showDetails">
    {{ $t('common.serverNotReachable') }}
  </button>
</template>

<style scoped>
.connection-banner {
  display: block;
  width: 100%;
  padding: 4px 16px;
  border: 0;
  background: var(--ion-color-danger, #eb445a);
  color: var(--ion-color-danger-contrast, #fff);
  font-size: 0.875rem;
  text-align: center;
}
</style>
