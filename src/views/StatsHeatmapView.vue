<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'

import AppPage from '@/components/AppPage.vue'
import ChipGroup from '@/components/ChipGroup.vue'
import ErrorText from '@/components/ErrorText.vue'
import { useAuth } from '@/composables/useAuth'
import { useLog } from '@/composables/useLog'
import { useRemote } from '@/composables/useRemote'
import { useUnits } from '@/composables/useUnits'
import { getFace } from '@/lib/faces'
import { density } from '@/lib/heat'
import { ringFill, ringLine } from '@/lib/plot'
import { computeStats, fromLog, positionsOf } from '@/lib/stats'

type Period = 'all' | 'days30' | 'days90' | 'year'

const SIZE = 40
const EXTENT = 1.2 // the picture shows this many spot radii to each side of the middle

const { t } = useI18n()
const route = useRoute()
const owner = route.params.id as string | undefined
const name = route.query.name as string | undefined
const title = name ? t('heatmap.titleFor', { name }) : t('heatmap.title')
const { formatDistance } = useUnits()
const { api, isLocal } = useAuth()
const { sessions: onDevice } = useLog()

const timeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}
const localDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const since = (period: Period) => {
  if (period === 'all') return undefined
  const from = new Date()
  if (period === 'year') from.setFullYear(from.getFullYear() - 1)
  else from.setDate(from.getDate() - (period === 'days30' ? 30 : 90))
  return localDay(from)
}

// The faces and distances the archer has shot are the choices.
const stats = useRemote(
  async () =>
    isLocal.value
      ? computeStats(fromLog(onDevice.value).sessions, new Date().toISOString(), timeZone(), 1)
      : ((await api.GET('/api/stats/', { params: { query: { owner: owner ? Number(owner) : undefined, tz: timeZone(), weeks: 1 } } })).data ?? null),
  { watch: [onDevice] },
)
const choices = computed(() => (stats.data.value?.scores ?? []).map((g) => ({ value: `${g.face}|${g.distance_m}`, label: `${g.face_name} · ${formatDistance(g.distance_m)}` })))
const wanted = ref<string | null>(route.query.face && route.query.distance ? `${route.query.face as string}|${route.query.distance as string}` : null)
const choice = computed({
  get: () => (choices.value.some((c) => c.value === wanted.value) ? wanted.value! : (choices.value[0]?.value ?? '')),
  set: (value: string) => (wanted.value = value),
})
const period = ref<Period>('all')
const periods = computed(() => (['all', 'days30', 'days90', 'year'] as const).map((value) => ({ value, label: t(`heatmap.${value}`) })))

const positions = useRemote(
  async () => {
    if (!choice.value) return null
    const [face, distance] = choice.value.split('|') as [string, string]
    if (isLocal.value) return positionsOf(fromLog(onDevice.value).sessions, { face, distance_m: distance, from: since(period.value), tz: timeZone() })
    return (
      await api.GET('/api/stats/positions/', {
        params: { query: { owner: owner ? Number(owner) : undefined, face, distance_m: Number(distance), from: since(period.value), tz: timeZone() } },
      })
    ).data ?? null
  },
  { watch: [choice, period] },
)

const face = computed(() => (positions.data.value ? getFace(positions.data.value.face) : undefined))
const heat = computed(() => density((positions.data.value?.points ?? []) as [number, number][], SIZE, EXTENT))
// The picture is drawn in cm: the spot radius is the unit the positions come in.
const radius = computed(() => positions.data.value?.radius_cm ?? 1)
const half = computed(() => radius.value * EXTENT)
const cell = computed(() => (2 * half.value) / SIZE)
const rings = computed(() =>
  face.value
    ? [...face.value.rings].reverse().map((ring) => {
        const fill = ringFill(face.value!, ring.value)
        return { value: ring.value, r: ring.diameter_cm / 2, fill, stroke: ringLine(fill) }
      })
    : [],
)
const tiles = computed(() =>
  heat.value.max === 0
    ? []
    : heat.value.cells.flatMap((v, i) => {
        const share = v / heat.value.max
        return share < 0.04 ? [] : [{ key: i, x: -half.value + (i % SIZE) * cell.value, y: -half.value + Math.floor(i / SIZE) * cell.value, opacity: Math.min(0.85, 0.15 + share * 0.7) }]
      }),
)
</script>

<template>
  <AppPage :title="title" back>
    <div class="screen">
      <ErrorText :message="stats.error.value ?? positions.error.value" />
      <div v-if="stats.loading.value">{{ $t('common.loading') }}</div>
      <div v-else-if="choices.length === 0">{{ $t('stats.noScored') }}</div>
      <template v-else>
        <ChipGroup v-model="choice" :options="choices" />
        <ChipGroup v-model="period" :label="$t('heatmap.period')" :options="periods" />
        <template v-if="positions.data.value">
          <div class="fw-semibold">{{ $t('heatmap.count', { n: positions.data.value.arrows }, positions.data.value.arrows) }}</div>
          <div v-if="positions.data.value.arrows === 0">{{ $t('heatmap.empty') }}</div>
          <svg v-else :viewBox="`${-half} ${-half} ${2 * half} ${2 * half}`" class="heatmap" role="img" :aria-label="$t('heatmap.picture')">
            <defs><filter id="heat-soften" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur :stdDeviation="cell * 0.6" /></filter></defs>
            <!-- The face is faded so the heat stands out on every ring colour. -->
            <g opacity="0.4">
              <circle v-for="ring in rings" :key="ring.value" cx="0" cy="0" :r="ring.r" :fill="ring.fill" />
            </g>
            <circle v-for="ring in rings" :key="`l${ring.value}`" cx="0" cy="0" :r="ring.r" fill="none" :stroke="ring.stroke" stroke-opacity="0.5" :stroke-width="radius / 150" />
            <g filter="url(#heat-soften)">
              <rect v-for="tile in tiles" :key="tile.key" :x="tile.x" :y="tile.y" :width="cell" :height="cell" fill="#7a1fa2" :opacity="tile.opacity" />
            </g>
          </svg>
          <div v-if="positions.data.value.limited" class="faint">{{ $t('heatmap.limited', { n: positions.data.value.points.length }) }}</div>
          <div v-if="heat.outside > 0" class="faint">{{ $t('heatmap.outside', { n: heat.outside }) }}</div>
          <div class="faint">{{ $t('heatmap.note') }}</div>
        </template>
      </template>
    </div>
  </AppPage>
</template>

<style scoped>
.heatmap { width: 100%; max-height: 70vh; aspect-ratio: 1; }
</style>
