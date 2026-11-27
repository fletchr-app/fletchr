<script setup lang="ts">
import { pointsOf } from '@/composables/useWhatsNew'
import type { WhatsNewEntry } from '@/lib/whats-new'

// The points of "what's new" entries, one block per version.
defineProps<{ entries: WhatsNewEntry[] }>()
</script>

<template>
  <div v-for="entry in entries" :key="entry.version" class="d-flex flex-column gap-1">
    <h3 class="h6 m-0">{{ $t('whatsNew.version', { version: entry.version }) }}</h3>
    <ul class="m-0 ps-3">
      <li v-for="(point, i) in pointsOf(entry)" :key="i">{{ point }}</li>
    </ul>
  </div>
</template>
