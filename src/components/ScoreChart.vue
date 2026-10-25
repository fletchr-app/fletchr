<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { computed, ref } from 'vue'

import DistributionBars from '@/components/DistributionBars.vue'
import { useElementWidth } from '@/composables/useElementWidth'
import { useUnits } from '@/composables/useUnits'
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

const { locale } = useI18n()
const { formatDistance } = useUnits()
const date = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y!, m! - 1, d).toLocaleDateString(locale.value, { day: 'numeric', month: 'short' })
}
const percent = (share: number) => `${Math.round(share * 100)}%`

// How one face at one distance went: the average points per arrow in each session, as a line. A filled
// dot is a practice session, a ring a competition. Each face and distance gets its own chart, because
// points on different faces cannot be compared.
const props = defineProps<{ group: Group; heatmapTo?: string }>()

const box = ref<HTMLElement | null>(null)
const width = useElementWidth(box)
const picked = ref<number | null>(null)
const asTable = ref(false)

const points = computed(() => props.group.sessions.slice(-MAX_POINTS))
const selected = computed(() => Math.min(picked.value ?? points.value.length - 1, points.value.length - 1))
const centredValues = computed(() => points.value.flatMap((p) => (p.centred_average == null ? [] : [p.centred_average])))
const domain = computed(() => scoreDomain([...points.value.map((p) => p.average), ...centredValues.value], props.group.max_value))
const plotH = HEIGHT - TOP - AXIS
const plotW = computed(() => width.value - LEFT - RIGHT)
const x = (i: number) => LEFT + (points.value.length === 1 ? plotW.value / 2 : (i / (points.value.length - 1)) * plotW.value)
const y = (v: number) => TOP + plotH * (1 - (v - domain.value.lo) / (domain.value.hi - domain.value.lo))
const line = computed(() => points.value.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(p.average)}`).join(' '))
const pick = computed(() => points.value[selected.value])
// The same chart with the group centre moved to the middle, from sessions with at least 6 plotted arrows. Broken where there is none.
const centredLine = computed(() => {
  let pen = 'M'
  return points.value
    .map((p, i) => {
      if (p.centred_average == null) {
        pen = 'M'
        return ''
      }
      const part = `${pen}${x(i)},${y(p.centred_average)}`
      pen = 'L'
      return part
    })
    .join(' ')
})
const showDot = (i: number) => points.value.length <= MARKERS_UP_TO || i === selected.value || i === points.value.length - 1
const hitWidth = computed(() => Math.max(24, plotW.value / points.value.length))
</script>

<template>
  <div class="chart-card">
    <div class="chart-title">{{ group.face_name }} · {{ formatDistance(group.distance_m) }}</div>
    <div>{{ $t('stats.averageOf', { n: group.arrows, avg: group.average.toFixed(2), max: group.max_value }, group.arrows) }}</div>
    <div>
      {{
        group.x_rate !== null && group.x_rate !== undefined
          ? $t('stats.bestRingX', { top: percent(group.top_rate), x: percent(group.x_rate) })
          : $t('stats.bestRing', { top: percent(group.top_rate) })
      }}
      · {{ $t('stats.misses', { rate: percent(group.miss_rate) }) }}
    </div>
    <DistributionBars :distribution="group.distribution" />
    <div v-if="pick">
      {{ $t('stats.pick', { date: date(pick.date), avg: pick.average.toFixed(2), n: pick.arrows }, pick.arrows) }}{{ pick.competition ? ` · ${$t('stats.competition')}` : '' }}
    </div>
    <div v-if="pick && pick.centred_average != null">
      {{ $t('stats.pickCentred', { centred: pick.centred_average.toFixed(2), real: pick.plotted_average!.toFixed(2) }) }}
    </div>
    <div v-if="asTable">
      <div v-for="p in [...points].reverse()" :key="p.session" class="d-flex justify-content-between py-1">
        <span>{{ $t(p.competition ? 'stats.tableRowCompetition' : 'stats.tableRow', { date: date(p.date), n: p.arrows }, p.arrows) }}</span>
        <span class="tabular">{{ p.average.toFixed(2) }}{{ p.centred_average != null ? ` · ${p.centred_average.toFixed(2)}` : '' }}</span>
      </div>
    </div>
    <div v-else-if="points.length > 1" ref="box" class="position-relative" :style="{ height: `${HEIGHT}px` }">
      <template v-if="width > 0">
        <svg :width="width" :height="HEIGHT">
          <line v-for="t in domain.ticks" :key="`g${t}`" :x1="LEFT" :x2="width - RIGHT" :y1="y(t)" :y2="y(t)" :class="t === domain.lo ? 'chart-baseline' : 'chart-grid'" />
          <text v-for="t in domain.ticks" :key="`t${t}`" :x="LEFT - 6" :y="y(t) + 4" text-anchor="end" class="chart-tick">{{ t }}</text>
          <path :d="line" class="chart-series-line" />
          <path v-if="centredValues.length > 1" :d="centredLine" class="chart-series2-line" />
          <circle v-if="centredValues.length === 1" :cx="x(points.findIndex((p) => p.centred_average != null))" :cy="y(centredValues[0]!)" r="3" class="chart-series2-fill" />
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
          :aria-label="$t('stats.pointLabel', { date: date(p.date), avg: p.average.toFixed(2) })"
          :style="{ left: `${x(i) - hitWidth / 2}px`, width: `${hitWidth}px`, top: `${TOP}px`, height: `${plotH}px` }"
          @click="picked = i"
        ></button>
      </template>
    </div>
    <div v-if="points.length === 1 && !asTable" style="color: var(--chart-muted)">{{ $t('stats.oneSession') }}</div>
    <div style="color: var(--chart-muted)">{{ $t('stats.note', { lo: domain.lo }) }}</div>
    <div v-if="centredValues.length > 0" style="color: var(--chart-muted)">{{ $t('stats.centredNote') }}</div>
    <button type="button" class="chart-link" @click="asTable = !asTable">{{ asTable ? $t('stats.showChart') : $t('stats.showTable') }}</button>
    <RouterLink v-if="heatmapTo" :to="heatmapTo" class="chart-link">{{ $t('stats.heatmapLink') }}</RouterLink>
  </div>
</template>
