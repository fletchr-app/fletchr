<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import ChipGroup from '@/components/ChipGroup.vue'
import { useElementWidth } from '@/composables/useElementWidth'
import { useUnits } from '@/composables/useUnits'
import type { components } from '@/lib/api-types'
import { niceTicks } from '@/lib/chart'
import { type CentreWords, describeCentre } from '@/lib/group'

type Group = components['schemas']['ScoreStats']

const HEIGHT = 160
const TOP = 12
const AXIS = 22
const LEFT = 56
const RIGHT = 14
const MAX_POINTS = 30

type Metric = 'spread' | 'x' | 'y'

const { t, locale } = useI18n()
const { units, formatLength, formatDistance } = useUnits()
const date = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y!, m! - 1, d).toLocaleDateString(locale.value, { day: 'numeric', month: 'short' })
}
const words = computed<CentreWords>(() => ({ left: t('plots.left'), right: t('plots.right'), low: t('plots.low'), high: t('plots.high'), middle: t('plots.middle') }))

// How the group of one face at one distance changed: its spread (the arrows get closer together or not) and where its
// centre sits left/right and low/high (the sight drifts). One point per session, only for arrows with a position.
const props = defineProps<{ group: Group }>()

const box = ref<HTMLElement | null>(null)
const width = useElementWidth(box)
const metric = ref<Metric>('spread')
const picked = ref<number | null>(null)
const asTable = ref(false)

type Point = { session: string; date: string; plotted: number; value: number }
const sessions = computed(() => props.group.sessions.filter((s) => s.plotted > 0 && s.spread != null))
const points = computed<Point[]>(() =>
  sessions.value.slice(-MAX_POINTS).map((s) => ({
    session: s.session,
    date: s.date,
    plotted: s.plotted,
    value: (metric.value === 'spread' ? s.spread! : metric.value === 'x' ? s.centre_x! : s.centre_y!) * props.group.radius_cm,
  })),
)
const selected = computed(() => Math.min(picked.value ?? points.value.length - 1, points.value.length - 1))
const pick = computed(() => points.value[selected.value])
const latest = computed(() => sessions.value[sessions.value.length - 1])

// A spread starts at 0. A centre is drawn around 0, as far out as the farthest point.
const axis = computed(() => {
  const far = Math.max(...points.value.map((p) => Math.abs(p.value)), 0.5)
  const { max, ticks } = niceTicks(far, 2)
  return metric.value === 'spread' ? { lo: 0, hi: max, ticks } : { lo: -max, hi: max, ticks: [...ticks.slice(1).map((v) => -v).reverse(), ...ticks] }
})
const plotH = HEIGHT - TOP - AXIS
const plotW = computed(() => width.value - LEFT - RIGHT)
const x = (i: number) => LEFT + (points.value.length === 1 ? plotW.value / 2 : (i / (points.value.length - 1)) * plotW.value)
const y = (v: number) => TOP + plotH * (1 - (v - axis.value.lo) / (axis.value.hi - axis.value.lo))
const line = computed(() => points.value.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(p.value)}`).join(' '))
const hitWidth = computed(() => Math.max(24, plotW.value / points.value.length))
const showDot = (i: number) => points.value.length <= 12 || i === selected.value || i === points.value.length - 1
const valueText = (v: number) => (metric.value === 'spread' ? formatLength(v) : `${v > 0 ? '+' : ''}${formatLength(v)}`)

const latestCentre = computed(() =>
  latest.value ? describeCentre({ n: latest.value.plotted, cx: latest.value.centre_x!, cy: latest.value.centre_y!, meanRadius: latest.value.spread! }, props.group.radius_cm, words.value, units.value) : '',
)
const metrics = computed(() => [
  { value: 'spread', label: t('stats.metricSpread') },
  { value: 'x', label: t('stats.metricSideways') },
  { value: 'y', label: t('stats.metricHeight') },
])
</script>

<template>
  <div v-if="sessions.length > 0" class="chart-card">
    <div class="chart-title">{{ $t('stats.groupTitle') }} · {{ group.face_name }} · {{ formatDistance(group.distance_m) }}</div>
    <div v-if="latest">
      {{ $t('stats.groupLatest', { centre: latestCentre, spread: formatLength(latest.spread! * group.radius_cm) }) }}
    </div>
    <ChipGroup v-model="metric" :options="metrics" />
    <div v-if="pick">{{ $t('stats.groupPointLabel', { date: date(pick.date), value: valueText(pick.value) }) }}</div>
    <div v-if="asTable">
      <div v-for="p in [...points].reverse()" :key="p.session" class="d-flex justify-content-between py-1">
        <span>{{ $t('stats.groupSessionRow', { date: date(p.date), n: p.plotted }, p.plotted) }}</span>
        <span class="tabular">{{ valueText(p.value) }}</span>
      </div>
    </div>
    <div v-else-if="points.length > 1" ref="box" class="position-relative" :style="{ height: `${HEIGHT}px` }">
      <template v-if="width > 0">
        <svg :width="width" :height="HEIGHT">
          <line v-for="v in axis.ticks" :key="`g${v}`" :x1="LEFT" :x2="width - RIGHT" :y1="y(v)" :y2="y(v)" :class="v === 0 ? 'chart-baseline' : 'chart-grid'" />
          <text v-for="v in axis.ticks" :key="`t${v}`" :x="LEFT - 6" :y="y(v) + 4" text-anchor="end" class="chart-tick">{{ formatLength(v) }}</text>
          <path :d="line" class="chart-series-line" />
          <template v-for="(p, i) in points" :key="p.session">
            <g v-if="showDot(i)">
              <circle :cx="x(i)" :cy="y(p.value)" r="6" class="chart-surface-fill" />
              <circle :cx="x(i)" :cy="y(p.value)" r="4" class="chart-series-fill" />
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
          :aria-label="$t('stats.groupPointLabel', { date: date(p.date), value: valueText(p.value) })"
          :style="{ left: `${x(i) - hitWidth / 2}px`, width: `${hitWidth}px`, top: `${TOP}px`, height: `${plotH}px` }"
          @click="picked = i"
        ></button>
      </template>
    </div>
    <div v-if="points.length === 1 && !asTable" style="color: var(--chart-muted)">{{ $t('stats.oneSession') }}</div>
    <div style="color: var(--chart-muted)">{{ $t('stats.groupNote') }}</div>
    <button type="button" class="chart-link" @click="asTable = !asTable">{{ asTable ? $t('stats.showChart') : $t('stats.showTable') }}</button>
  </div>
</template>
