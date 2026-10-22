<script setup lang="ts">
import AppPage from '@/components/AppPage.vue'
import { computed } from 'vue'
import { useRoute } from 'vue-router'

import ErrorText from '@/components/ErrorText.vue'
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
const route = useRoute()
const owner = route.params.id as string | undefined
const name = route.query.name as string | undefined
const title = name ? `${name}: statistics` : 'Statistics'
const hasBack = owner !== undefined // opened from an archer's page, not from the tab bar

const { api } = useAuth()
const { data, error, loading } = useRemote(
  async () =>
    (await api.GET('/api/stats/', { params: { query: { owner: owner ? Number(owner) : undefined, tz: timeZone(), weeks: WEEKS } } })).data ?? null,
)
</script>

<template>
  <AppPage :title="title" :back="hasBack">
    <div class="screen">
      <ErrorText :message="error" />
      <div v-if="loading">Loading…</div>
      <template v-if="data">
        <div class="d-flex gap-3">
          <div v-for="tile in [['This week', data.volume.this_week], ['This month', data.volume.this_month], ['All time', data.volume.total]]" :key="tile[0]" class="flex-fill">
            <div class="muted">{{ tile[0] }}</div>
            <div class="fs-2 fw-semibold">{{ tile[1] }}</div>
          </div>
        </div>
        <div class="faint">Arrows shot, scored or not.</div>
        <VolumeChart :weeks="data.volume.weeks" />
        <h2 class="h5 mt-2 mb-0">Average score</h2>
        <div v-if="data.scores.length === 0">No scored arrows yet.</div>
        <ScoreChart v-for="group in data.scores" :key="`${group.face}-${group.distance_m}`" :group="group" />
      </template>
    </div>
  </AppPage>
</template>
