<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { useUnits } from '@/composables/useUnits'
import type { components } from '@/lib/api-types'
import { type CentreWords, describeCentre } from '@/lib/group'

type Group = components['schemas']['ArrowStatsGroup']

/** An arrow with fewer shots than this says too little about itself. */
const MIN_SHOTS = 5

// The numbered arrows of one arrow set on one face and distance, the one that lands farthest from the group of its
// session first. A bar is how far its mean position is from the group centre. For finding the arrow to look at (a bent
// shaft, a loose point, a vane), not for a verdict.
const props = defineProps<{ group: Group }>()
const { t } = useI18n()
const { units, formatDistance, formatLength } = useUnits()
const words = computed<CentreWords>(() => ({ left: t('plots.left'), right: t('plots.right'), low: t('plots.low'), high: t('plots.high'), middle: t('plots.middle') }))

const radius = computed(() => props.group.radius_cm)
const sets = computed(() =>
  props.group.sets.map((set) => {
    const counted = set.arrows.filter((a) => a.shots >= MIN_SHOTS)
    const longest = Math.max(1e-9, ...counted.map((a) => a.offset))
    return {
      key: String(set.arrow_set),
      name: set.arrow_set_name ?? t('stats.arrowsNoSet'),
      rows: counted.map((a) => ({ ...a, share: a.offset / longest, where: describeCentre({ n: a.shots, cx: a.offset_x, cy: a.offset_y, meanRadius: a.spread }, radius.value, words.value, units.value) })),
      few: set.arrows.filter((a) => a.shots < MIN_SHOTS).map((a) => a.number).sort((x, y) => x - y),
    }
  }),
)
</script>

<template>
  <div v-for="set in sets" :key="set.key" class="chart-card">
    <div class="chart-title">{{ $t('stats.arrowsTitle') }} · {{ set.name }} · {{ group.face_name }} · {{ formatDistance(group.distance_m) }}</div>
    <div v-if="set.rows.length === 0">{{ $t('stats.arrowsNone', { n: MIN_SHOTS }) }}</div>
    <div v-for="row in set.rows" :key="row.number" class="arrow-row">
      <span class="arrow-number tabular">{{ row.number }}</span>
      <span class="arrow-body">
        <span class="arrow-track"><span class="arrow-bar" :style="{ width: `${Math.max(2, row.share * 100)}%` }"></span></span>
        <span>{{ row.where }} · {{ $t('stats.arrowsSpread', { spread: formatLength(row.spread * radius), n: row.shots }, row.shots) }}</span>
      </span>
    </div>
    <div v-if="set.few.length > 0 && set.rows.length > 0" class="faint">{{ $t('stats.arrowsFew', { numbers: set.few.join(', '), n: MIN_SHOTS }) }}</div>
    <div style="color: var(--chart-muted)">{{ $t('stats.arrowsNote') }}</div>
  </div>
</template>

<style scoped>
.arrow-row { display: flex; gap: 8px; align-items: flex-start; }
.arrow-number { width: 28px; text-align: right; font-weight: 600; }
.arrow-body { flex: 1 1 0; display: flex; flex-direction: column; gap: 2px; }
.arrow-track { height: 8px; }
.arrow-bar { display: block; height: 100%; background: var(--chart-series); border-radius: 0 3px 3px 0; }
</style>
