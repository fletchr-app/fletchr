<script setup lang="ts">
import { useAuth } from '@/composables/useAuth'
import { useConnection } from '@/composables/useConnection'

// Signed in, but the server cannot be reached: a red bar under the app bar of every screen, until it can. Nothing is lost meanwhile.
// Without an account the app does not use a server, so there is nothing to report.
const { status } = useAuth()
const { reachable } = useConnection()
</script>

<template>
  <div v-if="status === 'signedIn' && !reachable" class="connection-banner" role="alert">{{ $t('connection.lost') }}</div>
</template>

<style scoped>
.connection-banner {
  padding: 6px 16px;
  background: var(--ion-color-danger, #eb445a);
  color: var(--ion-color-danger-contrast, #fff);
  font-size: 0.875rem;
  text-align: center;
}
</style>
