<script setup lang="ts">
import AppButton from '@/components/AppButton.vue'
import { useLog } from '@/composables/useLog'

const { waiting, failed, retryFailed, discardFailed } = useLog()
</script>

<!-- Shows what has not reached the server yet. Nothing is lost while it waits: it is all saved on the device. -->
<template>
  <div v-if="waiting > 0 || failed.length > 0" class="d-flex flex-column gap-2 p-3 rounded border">
    <div v-if="waiting > 0">
      {{ waiting }} {{ waiting === 1 ? 'item is' : 'items are' }} waiting to upload. Saved on this device, they go up when there is a
      connection.
    </div>
    <template v-if="failed.length > 0">
      <div class="text-danger">
        {{ failed.length }} {{ failed.length === 1 ? 'item was' : 'items were' }} refused by the server: {{ failed[0]!.error }}
      </div>
      <AppButton secondary @click="retryFailed">Try again</AppButton>
      <AppButton secondary @click="discardFailed">Give up on these uploads</AppButton>
    </template>
  </div>
</template>
