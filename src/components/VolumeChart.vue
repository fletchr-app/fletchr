<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { computed, ref } from 'vue'

import { useElementWidth } from '@/composables/useElementWidth'
import { columnPath, compact, niceTicks } from '@/lib/chart'

const HEIGHT = 190
const TOP = 24 // room for the value above the tallest column
const AXIS = 22
const LEFT = 36
const RIGHT = 8
const MAX_BAR = 24

type Week = { week_start: string; arrows: number }

const { t, locale } = useI18n()
const date = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y!, m! - 1, d).toLocaleDateString(locale.value, { day: 'numeric', month: 'short' })
}

// Arrows per week as columns. Touch a column to read its value; the table view has all of them.
const props = defineProps<{ weeks: Week[] }>()

const box = ref<HTMLElement | null>(null)
const width = useElementWidth(box)
const picked = ref<number | null>(null)
const asTable = ref(false)
const selected = computed(() => picked.value ?? props.weeks.length - 1)

const plotH = HEIGHT - TOP - AXIS
const baseline = TOP + plotH
const scale = computed(() => niceTicks(Math.max(...props.weeks.map((w) => w.arrows))))
const slot = computed(() => (width.value - LEFT - RIGHT) / props.weeks.length)
const barWidth = computed(() => Math.max(2, Math.min(MAX_BAR, slot.value - 4)))
const y = (v: number) => TOP + plotH * (1 - v / scale.value.max)
const columns = computed(() =>
  props.weeks.flatMap((w, i) => {
    const h = (w.arrows / scale.value.max) * plotH
    return h > 0 ? [{ key: w.week_start, d: columnPath(LEFT + i * slot.value + (slot.value - barWidth.value) / 2, baseline, barWidth.value, h) }] : []
  }),
)
</script>

<template>
  <div class="chart-card">
    <div class="chart-title">{{ $t('stats.arrowsPerWeek') }}</div>
    <div>{{ $t('stats.weekOfArrows', { date: date(weeks[selected]!.week_start), n: weeks[selected]!.arrows }, weeks[selected]!.arrows) }}</div>
    <div v-if="asTable">
      <div v-for="w in [...weeks].reverse()" :key="w.week_start" class="d-flex justify-content-between py-1">
        <span>{{ $t('stats.weekOf', { date: date(w.week_start) }) }}</span>
        <span class="tabular">{{ w.arrows }}</span>
      </div>
    </div>
    <div v-else ref="box" class="position-relative" :style="{ height: `${HEIGHT}px` }">
      <template v-if="width > 0">
        <svg :width="width" :height="HEIGHT">
          <line v-for="t in scale.ticks" :key="`g${t}`" :x1="LEFT" :x2="width - RIGHT" :y1="y(t)" :y2="y(t)" :class="t === 0 ? 'chart-baseline' : 'chart-grid'" />
          <text v-for="t in scale.ticks" :key="`t${t}`" :x="LEFT - 6" :y="y(t) + 4" text-anchor="end" class="chart-tick">{{ compact(t) }}</text>
          <path v-for="c in columns" :key="c.key" :d="c.d" class="chart-series-fill" />
          <!-- The value on the cap of the touched column (the latest one until then), not on every column. -->
          <text :x="LEFT + selected * slot + slot / 2" :y="y(weeks[selected]!.arrows) - 6" text-anchor="middle" class="chart-value">
            {{ weeks[selected]!.arrows }}
          </text>
          <template v-for="(w, i) in weeks" :key="`x${w.week_start}`">
            <text v-if="(weeks.length - 1 - i) % 2 === 0" :x="LEFT + i * slot + slot / 2" :y="HEIGHT - 6" text-anchor="middle" class="chart-tick">
              {{ date(w.week_start) }}
            </text>
          </template>
        </svg>
        <!-- Touch areas: the whole column slot, wider than the thin column itself. -->
        <button
          v-for="(w, i) in weeks"
          :key="w.week_start"
          type="button"
          class="chart-hit"
          :aria-label="$t('stats.weekLabel', { date: date(w.week_start), n: w.arrows }, w.arrows)"
          :style="{ left: `${LEFT + i * slot}px`, width: `${slot}px`, top: `${TOP}px`, height: `${plotH}px` }"
          @click="picked = i"
        ></button>
      </template>
    </div>
    <button type="button" class="chart-link" @click="asTable = !asTable">{{ asTable ? $t('stats.showChart') : $t('stats.showTable') }}</button>
  </div>
</template>
