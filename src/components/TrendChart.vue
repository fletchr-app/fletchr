<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { useElementWidth } from '@/composables/useElementWidth'
import type { Point } from '@/lib/progress'

const HEIGHT = 140
const TOP = 10
const AXIS = 22
const LEFT = 22
const RIGHT = 12

// One group of an evaluation form over time: the coach's mean rating as a solid line, the archer's own as a dashed one.
// The axis runs from 1 to the scale of the form; the dates are placed by time.
const props = defineProps<{ coach: Point[]; self: Point[]; scale: number }>()
const { locale } = useI18n()
const box = ref<HTMLElement | null>(null)
const width = useElementWidth(box)

const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`)
const all = computed(() => [...props.coach, ...props.self].map((p) => day(p.date)))
const first = computed(() => Math.min(...all.value))
const last = computed(() => Math.max(...all.value))
const plotW = computed(() => width.value - LEFT - RIGHT)
const plotH = HEIGHT - TOP - AXIS
const x = (iso: string) => LEFT + (last.value === first.value ? plotW.value / 2 : ((day(iso) - first.value) / (last.value - first.value)) * plotW.value)
const y = (v: number) => TOP + plotH * (1 - (v - 1) / Math.max(1, props.scale - 1))
const path = (points: Point[]) => points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.date)},${y(p.value)}`).join(' ')
const ticks = computed(() => Array.from({ length: props.scale }, (_, i) => i + 1))
const label = (ms: number) => new Date(ms).toLocaleDateString(locale.value, { day: 'numeric', month: 'short', timeZone: 'UTC' })
</script>

<template>
  <div ref="box" :style="{ height: `${HEIGHT}px` }">
    <svg v-if="width > 0 && all.length" :width="width" :height="HEIGHT" role="img" :aria-label="$t('progress.chartLabel')">
      <line v-for="t in ticks" :key="`g${t}`" :x1="LEFT" :x2="width - RIGHT" :y1="y(t)" :y2="y(t)" :class="t === 1 ? 'chart-baseline' : 'chart-grid'" />
      <text v-for="t in ticks" :key="`t${t}`" :x="LEFT - 6" :y="y(t) + 4" text-anchor="end" class="chart-tick">{{ t }}</text>
      <path v-if="self.length > 1" :d="path(self)" class="chart-series2-line" />
      <path v-if="coach.length > 1" :d="path(coach)" class="chart-series-line" />
      <circle v-for="p in self" :key="`s${p.date}`" :cx="x(p.date)" :cy="y(p.value)" r="4" class="chart-series2-fill" />
      <circle v-for="p in coach" :key="`c${p.date}`" :cx="x(p.date)" :cy="y(p.value)" r="4" class="chart-series-fill" />
      <text :x="LEFT" :y="HEIGHT - 6" text-anchor="start" class="chart-tick">{{ label(first) }}</text>
      <text v-if="last !== first" :x="width - RIGHT" :y="HEIGHT - 6" text-anchor="end" class="chart-tick">{{ label(last) }}</text>
    </svg>
  </div>
</template>
