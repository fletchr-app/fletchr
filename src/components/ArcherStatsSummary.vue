<script setup lang="ts">
import ErrorText from '@/components/ErrorText.vue'
import SectionLink from '@/components/SectionLink.vue'
import { useAuth } from '@/composables/useAuth'
import { useRemote } from '@/composables/useRemote'

const WEEKS = 1

const timeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

// The arrows an archer shot this week, this month and in total; the statistics page has the weekly chart and the scores.
const props = defineProps<{ archerId: number; name: string }>()
const { api } = useAuth()
const stats = useRemote(async () => (await api.GET('/api/stats/', { params: { query: { owner: props.archerId, tz: timeZone(), weeks: WEEKS } } })).data ?? null)
</script>

<template>
  <div class="d-flex flex-column gap-2">
    <div class="d-flex align-items-center justify-content-between">
      <h2 class="h5 m-0">{{ $t('stats.title') }}</h2>
      <SectionLink v-if="stats.data.value?.volume.total" :to="`/archers/${archerId}/stats?name=${encodeURIComponent(name)}`" />
    </div>
    <ErrorText :message="stats.error.value" />
    <template v-if="stats.data.value">
      <div class="d-flex gap-3">
        <div v-for="tile in [[$t('stats.thisWeek'), stats.data.value.volume.this_week], [$t('stats.thisMonth'), stats.data.value.volume.this_month], [$t('stats.allTime'), stats.data.value.volume.total]]" :key="tile[0]" class="flex-fill">
          <div class="muted">{{ tile[0] }}</div>
          <div class="fs-2 fw-semibold">{{ tile[1] }}</div>
        </div>
      </div>
      <div class="faint">{{ $t('stats.arrowsShot') }}</div>
    </template>
  </div>
</template>
