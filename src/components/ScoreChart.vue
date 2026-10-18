<script setup lang="ts">
import { computed, ref } from 'vue'

import { useElementWidth } from '@/composables/useElementWidth'
import type { components } from '@/lib/api-types'
import { scoreDomain } from '@/lib/chart'

type Group = components['schemas']['ScoreStats']

const HEIGHT = 160
const TOP = 12
const AXIS = 22
const LEFT = 30
const RIGHT = 14
const MAX_POINTS = 30
const MARKERS_UP_TO = 12 // more points than this and only the touched and the latest one get a dot

const date = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y!, m! - 1, d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}
const percent = (share: number) => `${Math.round(share * 100)}%`

// How one face at one distance went: the average points per arrow in each session, as a line. A filled
// dot is a practice session, a ring a competition. Each face and distance gets its own chart, because
// points on different faces cannot be compared.
const props = defineProps<{ group: Group }>()

const box = ref<HTMLElement | null>(null)
const width = useElementWidth(box)
const picked = ref<number | null>(null)
const asTable = ref(false)

const points = computed(() => props.group.sessions.slice(-MAX_POINTS))
const selected = computed(() => Math.min(picked.value ?? points.value.length - 1, points.value.length - 1))
const domain = computed(() => scoreDomain(points.value.map((p) => p.average), props.group.max_value))
const plotH = HEIGHT - TOP - AXIS
const plotW = computed(() => width.value - LEFT - RIGHT)
const x = (i: number) => LEFT + (points.value.length === 1 ? plotW.value / 2 : (i / (points.value.length - 1)) * plotW.value)
const y = (v: number) => TOP + plotH * (1 - (v - domain.value.lo) / (domain.value.hi - domain.value.lo))
const line = computed(() => points.value.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(p.average)}`).join(' '))
const pick = computed(() => points.value[selected.value])
const showDot = (i: number) => points.value.length <= MARKERS_UP_TO || i === selected.value || i === points.value.length - 1
const hitWidth = computed(() => Math.max(24, plotW.value / points.value.length))
</script>

<template>
  <div class="chart-card">
    <div class="chart-title">{{ group.face_name }} · {{ Number(group.distance_m) }} m</div>
    <div>{{ group.arrows }} arrows · average {{ group.average.toFixed(2) }} of {{ group.max_value }}</div>
    <div>
      Best ring {{ percent(group.top_rate) }}<template v-if="group.x_rate !== null && group.x_rate !== undefined"> · X {{ percent(group.x_rate) }}</template> ·
      misses {{ percent(group.miss_rate) }}
    </div>
    <div v-if="pick">
      {{ date(pick.date) }}: average {{ pick.average.toFixed(2) }} · {{ pick.arrows }} arrows{{ pick.competition ? ' · competition' : '' }}
    </div>
    <div v-if="asTable">
      <div v-for="p in [...points].reverse()" :key="p.session" class="d-flex justify-content-between py-1">
        <span>{{ date(p.date) }}{{ p.competition ? ' (competition)' : '' }} · {{ p.arrows }} arrows</span>
        <span class="tabular">{{ p.average.toFixed(2) }}</span>
      </div>
    </div>
    <div v-else-if="points.length > 1" ref="box" class="position-relative" :style="{ height: `${HEIGHT}px` }">
      <template v-if="width > 0">
        <svg :width="width" :height="HEIGHT">
          <line v-for="t in domain.ticks" :key="`g${t}`" :x1="LEFT" :x2="width - RIGHT" :y1="y(t)" :y2="y(t)" :class="t === domain.lo ? 'chart-baseline' : 'chart-grid'" />
          <text v-for="t in domain.ticks" :key="`t${t}`" :x="LEFT - 6" :y="y(t) + 4" text-anchor="end" class="chart-tick">{{ t }}</text>
          <path :d="line" class="chart-series-line" />
          <template v-for="(p, i) in points" :key="p.session">
            <g v-if="showDot(i)">
              <circle :cx="x(i)" :cy="y(p.average)" r="6" class="chart-surface-fill" />
              <circle
                :cx="x(i)" :cy="y(p.average)" :r="p.competition ? 3 : 4"
                :class="[p.competition ? 'chart-surface-fill' : 'chart-series-fill', 'chart-series-stroke']"
                :stroke-width="p.competition ? 2 : 0"
              />
            </g>
          </template>
          <text :x="LEFT" :y="HEIGHT - 6" text-anchor="start" class="chart-tick">{{ date(points[0]!.date) }}</text>
          <text :x="width - RIGHT" :y="HEIGHT - 6" text-anchor="end" class="chart-tick">{{ date(points[points.length - 1]!.date) }}</text>
        </svg>
        <button
          v-for="(p, i) in points"
          :key="p.session"
          type="button"
          class="chart-hit"
          :aria-label="`${date(p.date)}: average ${p.average.toFixed(2)}`"
          :style="{ left: `${x(i) - hitWidth / 2}px`, width: `${hitWidth}px`, top: `${TOP}px`, height: `${plotH}px` }"
          @click="picked = i"
        ></button>
      </template>
    </div>
    <div v-if="points.length === 1 && !asTable" style="color: var(--chart-muted)">One session so far: the line appears after the next one.</div>
    <div style="color: var(--chart-muted)">One point per session. A ring is a competition. The scale starts at {{ domain.lo }}, not at 0.</div>
    <button type="button" class="chart-link" @click="asTable = !asTable">{{ asTable ? 'Show as chart' : 'Show as table' }}</button>
  </div>
</template>
