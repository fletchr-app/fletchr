<script setup lang="ts">
import { onIonViewWillEnter } from '@ionic/vue'
import { computed } from 'vue'
import { useRoute } from 'vue-router'

import AppPage from '@/components/AppPage.vue'
import ErrorText from '@/components/ErrorText.vue'
import RadarChart from '@/components/RadarChart.vue'
import TrendChart from '@/components/TrendChart.vue'
import { useAuth } from '@/composables/useAuth'
import { useRemote } from '@/composables/useRemote'
import { type Evaluated, movers, progress, radarAxes } from '@/lib/progress'

// How the ratings of one archer developed: a chart for each group of the form (coach solid, own ratings dashed) and, below it,
// every criterion with its latest rating and the change since the one before. A coach sees all evaluations of their teams,
// an archer those a coach shared and their own.
const route = useRoute()
const { api } = useAuth()
const archerId = Number(route.params.id)
const name = route.query.name as string | undefined

const list = useRemote(async () => (await api.GET('/api/evaluations/', { params: { query: { archer: archerId } } })).data ?? null)
let first = true
onIonViewWillEnter(() => (first ? (first = false) : list.reload()))

const evaluations = computed(() => (list.data.value ?? []) as unknown as (Evaluated & { scale: number })[])
const groups = computed(() => progress(evaluations.value))
const axes = computed(() => radarAxes(groups.value))
const lists = computed(() => movers(groups.value))
const scale = computed(() => Math.max(5, ...evaluations.value.map((e) => e.scale)))
const change = (n: number | null) => (n === null || n === 0 ? '' : n > 0 ? `+${n}` : `${n}`)
</script>

<template>
  <AppPage :title="name ? $t('progress.titleFor', { name }) : $t('progress.title')">
    <div class="screen">
      <ErrorText :message="list.error.value" />
      <div v-if="list.loading.value && !list.data.value">{{ $t('common.loading') }}</div>
      <div v-else-if="groups.length === 0">{{ $t('progress.empty') }}</div>
      <template v-else>
        <div class="d-flex gap-3 flex-wrap">
          <span><svg width="26" height="8" aria-hidden="true"><line x1="0" y1="4" x2="26" y2="4" class="chart-series-line" /></svg> {{ $t('progress.coach') }}</span>
          <span><svg width="26" height="8" aria-hidden="true"><line x1="0" y1="4" x2="26" y2="4" class="chart-series2-line" /></svg> {{ $t('progress.self') }}</span>
        </div>
        <div v-if="lists.improved.length || lists.attention.length" class="chart-card">
          <template v-if="lists.improved.length">
            <div class="chart-title">{{ $t('progress.improved') }}</div>
            <div v-for="m in lists.improved" :key="m.key" class="d-flex justify-content-between gap-2">
              <span>{{ m.label }}</span><span class="tabular text-nowrap">+{{ m.change }} → {{ m.latest }}</span>
            </div>
          </template>
          <template v-if="lists.attention.length">
            <div class="chart-title">{{ $t('progress.attention') }}</div>
            <div v-for="m in lists.attention" :key="m.key" class="d-flex justify-content-between gap-2">
              <span>{{ m.label }}</span><span class="tabular text-nowrap">{{ m.latest }}</span>
            </div>
          </template>
        </div>
        <div v-if="axes.length >= 3" class="chart-card">
          <div class="chart-title">{{ $t('progress.radar') }}</div>
          <RadarChart :axes="axes" :scale="scale" />
          <div class="muted">{{ axes.some((a) => a.earlier !== null) ? $t('progress.radarNote') : $t('progress.radarOne') }}</div>
        </div>
        <div v-for="g in groups" :key="g.group" class="chart-card">
          <div class="chart-title">{{ g.group }}</div>
          <TrendChart :coach="g.coach" :self="g.self" :scale="scale" />
          <div v-for="c in g.criteria" :key="c.key" class="d-flex justify-content-between gap-2">
            <span>{{ c.label }}</span>
            <span class="tabular text-nowrap">
              <template v-if="c.coach.latest !== null">{{ $t('progress.coachShort') }} {{ c.coach.latest }}<template v-if="change(c.coach.change)"> ({{ change(c.coach.change) }})</template></template>
              <template v-if="c.self.latest !== null"> · {{ $t('progress.selfShort') }} {{ c.self.latest }}<template v-if="change(c.self.change)"> ({{ change(c.self.change) }})</template></template>
            </span>
          </div>
        </div>
      </template>
    </div>
  </AppPage>
</template>
