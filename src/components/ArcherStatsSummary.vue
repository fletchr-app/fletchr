<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router'

import ErrorText from '@/components/ErrorText.vue'
import SectionLink from '@/components/SectionLink.vue'
import type { StatsResult } from '@/lib/stats'

// The arrows shot this week, this month and in total; the statistics page has the weekly chart and the scores.
defineProps<{ volume: StatsResult['volume'] | null; error: string | null; to?: RouteLocationRaw }>()
</script>

<template>
  <div class="d-flex flex-column gap-2">
    <div class="d-flex align-items-center justify-content-between">
      <h2 class="h5 m-0">{{ $t('stats.title') }}</h2>
      <SectionLink :to="to" />
    </div>
    <ErrorText :message="error" />
    <template v-if="volume">
      <div class="d-flex gap-3">
        <div v-for="tile in [[$t('stats.thisWeek'), volume.this_week], [$t('stats.thisMonth'), volume.this_month], [$t('stats.allTime'), volume.total]]" :key="tile[0]" class="flex-fill">
          <div class="muted">{{ tile[0] }}</div>
          <div class="fs-2 fw-semibold">{{ tile[1] }}</div>
        </div>
      </div>
      <div class="faint">{{ $t('stats.arrowsShot') }}</div>
    </template>
  </div>
</template>
