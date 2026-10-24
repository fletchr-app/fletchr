<script setup lang="ts">
import { computed, ref } from 'vue'

import { useElementWidth } from '@/composables/useElementWidth'
import type { RadarAxis } from '@/lib/progress'

const HEIGHT = 280
const LABEL = 70 // room around the web for the group names
const SHORT = 14

// The ratings of one archer by group as a web: the latest mean as a solid shape, the first one dashed. The rings are the steps 1 to `scale`.
const props = defineProps<{ axes: RadarAxis[]; scale: number }>()
const box = ref<HTMLElement | null>(null)
const width = useElementWidth(box)

const cx = computed(() => width.value / 2)
const cy = HEIGHT / 2
const radius = computed(() => Math.max(20, Math.min(width.value, HEIGHT) / 2 - LABEL))
const angle = (i: number) => -Math.PI / 2 + (i / props.axes.length) * 2 * Math.PI
const point = (i: number, value: number) => {
  const r = (radius.value * (value - 1)) / Math.max(1, props.scale - 1)
  return `${cx.value + r * Math.cos(angle(i))},${cy + r * Math.sin(angle(i))}`
}
const ring = (v: number) => props.axes.map((_, i) => point(i, v)).join(' ')
const shape = (pick: (a: RadarAxis) => number | null) => (props.axes.every((a) => pick(a) !== null) ? props.axes.map((a, i) => point(i, pick(a)!)).join(' ') : null)
const latest = computed(() => shape((a) => a.latest))
const earlier = computed(() => shape((a) => a.earlier))
const steps = computed(() => Array.from({ length: props.scale }, (_, i) => i + 1))
const labelAt = (i: number) => {
  const r = radius.value + 8
  const a = angle(i)
  const x = cx.value + r * Math.cos(a)
  const anchor = Math.abs(Math.cos(a)) < 0.2 ? 'middle' : Math.cos(a) > 0 ? 'start' : 'end'
  return { x, y: cy + r * Math.sin(a) + (Math.sin(a) > 0.2 ? 10 : Math.sin(a) < -0.2 ? -2 : 4), anchor }
}
const short = (s: string) => (s.length > SHORT ? `${s.slice(0, SHORT - 1)}…` : s)
</script>

<template>
  <div ref="box" :style="{ height: `${HEIGHT}px` }">
    <svg v-if="width > 0" :width="width" :height="HEIGHT" role="img" :aria-label="$t('progress.radarLabel')">
      <polygon v-for="v in steps" :key="v" :points="ring(v)" :class="v === 1 ? 'chart-baseline' : 'chart-grid'" fill="none" />
      <line v-for="(a, i) in axes" :key="`s${a.group}`" :x1="cx" :y1="cy" :x2="point(i, scale).split(',')[0]" :y2="point(i, scale).split(',')[1]" class="chart-grid" />
      <polygon v-if="earlier" :points="earlier" class="chart-series2-line" />
      <polygon v-if="latest" :points="latest" class="chart-series-line" style="fill: var(--chart-series); fill-opacity: 0.15" />
      <text v-for="(a, i) in axes" :key="`l${a.group}`" :x="labelAt(i).x" :y="labelAt(i).y" :text-anchor="labelAt(i).anchor" class="chart-tick">{{ short(a.group) }}</text>
    </svg>
  </div>
</template>
