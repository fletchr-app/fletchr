<script setup lang="ts">
import { computed } from 'vue'

import type { EndFigure } from '@/lib/session-stats'

// The points of each end, one column per end in the order shot. The columns share one scale, so a weak end shows.
const props = defineProps<{ ends: EndFigure[] }>()
const largest = computed(() => Math.max(1, ...props.ends.map((e) => e.total)))
</script>

<template>
  <div v-if="ends.length > 0" class="end-bars">
    <div class="chart-title" style="font-size: 14px">{{ $t('summary.pointsPerEnd') }}</div>
    <div class="columns">
      <div v-for="e in ends" :key="e.index" class="column">
        <span class="tabular value">{{ e.total }}</span>
        <span class="track"><span class="bar" :style="{ height: `${(e.total / largest) * 100}%` }"></span></span>
        <span class="tabular faint">{{ e.index + 1 }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.end-bars { display: flex; flex-direction: column; gap: 4px; }
.columns { display: flex; gap: 4px; align-items: stretch; overflow-x: auto; }
.column { display: flex; flex-direction: column; align-items: center; gap: 2px; flex: 1 1 0; min-width: 24px; }
.value { font-size: 12px; }
.track { display: flex; align-items: flex-end; width: 100%; height: 96px; }
.bar { display: block; width: 100%; min-height: 2px; background: var(--chart-series); border-radius: 3px 3px 0 0; }
</style>
