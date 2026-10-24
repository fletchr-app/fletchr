<script setup lang="ts">
import { useCompatibility } from '@/composables/useServer'

// Says so when the app and the server do not fit: nothing else would, and a note might lose its frame without a word.
const compat = useCompatibility()
</script>

<template>
  <div v-if="compat === 'appTooOld'" class="p-3 rounded border border-danger text-danger">{{ $t('version.appTooOld') }}</div>
  <div v-else-if="compat === 'serverOlder'" class="p-3 rounded border">{{ $t('version.serverOlder') }}</div>
</template>
