<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

import ErrorText from '@/components/ErrorText.vue'
import ScoreChart from '@/components/ScoreChart.vue'
import VolumeChart from '@/components/VolumeChart.vue'
import { useAuth } from '@/composables/useAuth'
import { usePageTitle } from '@/composables/usePageTitle'
import { useRemote } from '@/composables/useRemote'

const WEEKS = 12

const timeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

// Volume and average scores: your own, or those of an archer you coach (with ?owner=).
const route = useRoute()
const owner = computed(() => route.query.owner as string | undefined)
const name = computed(() => route.query.name as string | undefined)
usePageTitle(() => (name.value ? `${name.value}: statistics` : null))

const { api } = useAuth()
const { data, error, loading } = useRemote(
  async () =>
    (await api.GET('/api/stats/', { params: { query: { owner: owner.value ? Number(owner.value) : undefined, tz: timeZone(), weeks: WEEKS } } })).data ?? null,
)
</script>

<template>
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
</template>
