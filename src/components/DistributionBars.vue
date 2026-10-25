<script setup lang="ts">
import { computed } from 'vue'

import type { components } from '@/lib/api-types'

type Count = components['schemas']['ValueCount']

// How many arrows scored each value, as bars. The best ring is on top; rings below the lowest one that was hit are left out.
const props = defineProps<{ distribution: Count[] }>()

const total = computed(() => props.distribution.reduce((sum, d) => sum + d.count, 0))
const rows = computed(() => {
  const last = props.distribution.reduce((found, d, i) => (d.count > 0 ? i : found), -1)
  const largest = Math.max(1, ...props.distribution.map((d) => d.count))
  return props.distribution.slice(0, last + 1).map((d) => ({ ...d, share: d.count / largest, percent: Math.round((d.count / total.value) * 100) }))
})
</script>

<template>
  <div v-if="total > 0" class="distribution">
    <div class="chart-title" style="font-size: 14px">{{ $t('stats.distribution') }}</div>
    <div v-for="row in rows" :key="row.value" class="distribution-row">
      <span class="distribution-label tabular">{{ row.value === 0 ? $t('stats.distributionMiss') : row.value }}</span>
      <span class="distribution-track"><span class="distribution-bar" :style="{ width: `${row.share * 100}%` }"></span></span>
      <span class="distribution-count tabular">{{ row.count }} · {{ row.percent }}%</span>
    </div>
  </div>
</template>

<style scoped>
.distribution { display: flex; flex-direction: column; gap: 2px; }
.distribution-row { display: flex; align-items: center; gap: 8px; }
.distribution-label { width: 36px; text-align: right; }
.distribution-track { flex: 1 1 0; height: 12px; }
.distribution-bar { display: block; height: 100%; min-width: 0; background: var(--chart-series); border-radius: 0 3px 3px 0; }
.distribution-count { width: 72px; text-align: right; white-space: nowrap; }
</style>
