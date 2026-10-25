<script setup lang="ts">
import { onIonViewWillEnter } from '@ionic/vue'
import AppPage from '@/components/AppPage.vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'

import ArrowOffsets from '@/components/ArrowOffsets.vue'
import ErrorText from '@/components/ErrorText.vue'
import GroupTrend from '@/components/GroupTrend.vue'
import RatingBars from '@/components/RatingBars.vue'
import SetupCompare from '@/components/SetupCompare.vue'
import ScoreChart from '@/components/ScoreChart.vue'
import VolumeChart from '@/components/VolumeChart.vue'
import { useAuth } from '@/composables/useAuth'
import { useRemote } from '@/composables/useRemote'

const WEEKS = 12

const timeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

// Volume and average scores: your own (tab), or those of an archer you coach (/archers/:id/stats).
const { t } = useI18n()
const route = useRoute()
const owner = route.params.id as string | undefined
const name = route.query.name as string | undefined
const title = name ? t('stats.titleFor', { name }) : t('stats.title')
const hasBack = owner !== undefined // opened from an archer's page, not from the tab bar

// The heatmap screen of the same archer, preselected to a face and distance.
const heatmapTo = (face: string, distance: string) =>
  `${owner ? `/archers/${owner}` : ''}/stats/heatmap?${new URLSearchParams({ face, distance, ...(name ? { name } : {}) })}`

const { api } = useAuth()
const { data, error, loading, reload } = useRemote(
  async () =>
    (await api.GET('/api/stats/', { params: { query: { owner: owner ? Number(owner) : undefined, tz: timeZone(), weeks: WEEKS } } })).data ?? null,
)

// The names of the equipment setups, for the comparison.
const setups = useRemote(async () => (await api.GET('/api/setups/', { params: { query: { owner: owner ? Number(owner) : undefined } } })).data ?? null)
const setupLabels = computed(() =>
  Object.fromEntries(
    (setups.data.value ?? []).map((s) => [
      s.id,
      [`${s.bow.name} (r${s.bow.number})`, s.arrow_set ? `${s.arrow_set.name} (r${s.arrow_set.number})` : ''].filter(Boolean).join(' · '),
    ]),
  ),
)

// Numbered arrows: which ones land away from the group. Empty for an archer who does not number them.
const arrows = useRemote(async () => (await api.GET('/api/stats/arrows/', { params: { query: { owner: owner ? Number(owner) : undefined } } })).data ?? null)

// The tab stays alive between visits: show fresh numbers each time it is opened again (the first time it has just loaded).
let firstVisit = true
onIonViewWillEnter(() => {
  if (firstVisit) firstVisit = false
  else {
    reload()
    setups.reload()
    arrows.reload()
  }
})
</script>

<template>
  <AppPage :title="title" :back="hasBack">
    <div class="screen">
      <ErrorText :message="error" />
      <div v-if="loading">{{ $t('common.loading') }}</div>
      <template v-if="data">
        <div class="d-flex gap-3">
          <div v-for="tile in [[$t('stats.thisWeek'), data.volume.this_week], [$t('stats.thisMonth'), data.volume.this_month], [$t('stats.allTime'), data.volume.total]]" :key="tile[0]" class="flex-fill">
            <div class="muted">{{ tile[0] }}</div>
            <div class="fs-2 fw-semibold">{{ tile[1] }}</div>
          </div>
        </div>
        <div class="faint">{{ $t('stats.arrowsShot') }}</div>
        <VolumeChart :weeks="data.volume.weeks" />
        <h2 class="h5 mt-2 mb-0">{{ $t('stats.averageScore') }}</h2>
        <div v-if="data.scores.length === 0">{{ $t('stats.noScored') }}</div>
        <template v-for="group in data.scores" :key="`${group.face}-${group.distance_m}`">
          <ScoreChart :group="group" :heatmap-to="heatmapTo(group.face, group.distance_m)" />
          <GroupTrend :group="group" />
          <RatingBars :group="group" />
          <SetupCompare :group="group" :labels="setupLabels" />
        </template>
        <template v-if="arrows.data.value?.length">
          <h2 class="h5 mt-2 mb-0">{{ $t('stats.numberedArrows') }}</h2>
          <ArrowOffsets v-for="group in arrows.data.value" :key="`${group.face}-${group.distance_m}`" :group="group" />
        </template>
      </template>
    </div>
  </AppPage>
</template>
