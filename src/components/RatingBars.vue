<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import ChipGroup from '@/components/ChipGroup.vue'
import { useUnits } from '@/composables/useUnits'
import type { components } from '@/lib/api-types'
import { byRating, comparable, type RatingKey } from '@/lib/rating-stats'

type Group = components['schemas']['ScoreStats']

// How the score goes with the ratings the archer gave their sessions (physical and mental form, 1 to 5): the average
// score of the sessions rated 1, of those rated 2, and so on. For one face and distance, like the average chart.
const props = defineProps<{ group: Group }>()
const { t } = useI18n()
const { formatDistance } = useUnits()

const metric = ref<RatingKey>('physical_rating')
const barsOf = (key: RatingKey) => byRating(props.group.sessions, key)
const available = computed(() => (['physical_rating', 'mental_rating'] as const).filter((key) => comparable(barsOf(key))))
const shownKey = computed(() => (available.value.includes(metric.value) ? metric.value : available.value[0]!))
const bars = computed(() => barsOf(shownKey.value))
const options = computed(() => available.value.map((value) => ({ value, label: t(value === 'physical_rating' ? 'stats.ratingPhysical' : 'stats.ratingMental') })))

// The bars start below the lowest average, not at 0, or a difference of half a point would not show.
const lo = computed(() => Math.max(0, Math.floor(Math.min(...bars.value.map((b) => b.average)) - 1)))
const share = (average: number) => Math.max(0.04, (average - lo.value) / (props.group.max_value - lo.value))
</script>

<template>
  <div v-if="available.length > 0" class="chart-card">
    <div class="chart-title">{{ $t('stats.ratingTitle') }} · {{ group.face_name }} · {{ formatDistance(group.distance_m) }}</div>
    <ChipGroup v-if="available.length > 1" v-model="metric" :options="options" />
    <div v-for="bar in bars" :key="bar.rating" class="rating-row">
      <span class="rating-label tabular">{{ bar.rating }}</span>
      <span class="rating-track"><span class="rating-bar" :style="{ width: `${share(bar.average) * 100}%` }"></span></span>
      <span class="rating-value tabular">{{ bar.average.toFixed(2) }} · {{ $t('stats.ratingSessions', { n: bar.sessions }, bar.sessions) }}</span>
    </div>
    <div style="color: var(--chart-muted)">{{ $t('stats.ratingNote', { lo }) }}</div>
  </div>
</template>

<style scoped>
.rating-row { display: flex; align-items: center; gap: 8px; }
.rating-label { width: 16px; text-align: right; }
.rating-track { flex: 1 1 0; height: 14px; }
.rating-bar { display: block; height: 100%; background: var(--chart-series); border-radius: 0 3px 3px 0; }
.rating-value { width: 118px; text-align: right; white-space: nowrap; }
</style>
