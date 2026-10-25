<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'

import AppPage from '@/components/AppPage.vue'
import ChipGroup from '@/components/ChipGroup.vue'
import ErrorText from '@/components/ErrorText.vue'
import { useAuth } from '@/composables/useAuth'
import { useRemote } from '@/composables/useRemote'
import { useUnits } from '@/composables/useUnits'

type Days = '7' | '28' | '90'
type Sort = 'arrows' | 'average'

// How the archers compare: arrows shot in the last weeks and the average on one face and distance. Coaches only,
// and only when an admin switched it on for the team.
const { t } = useI18n()
const route = useRoute()
const teamId = Number(route.params.id)
const { api } = useAuth()
const { formatDistance } = useUnits()

const days = ref<Days>('28')
const sort = ref<Sort>('arrows')
const wanted = ref<string>('') // "face|distance"; empty: the one shot most
const periods = computed(() => (['7', '28', '90'] as const).map((value) => ({ value, label: t('ranking.days', { n: value }) })))
const sorts = computed(() => (['arrows', 'average'] as const).map((value) => ({ value, label: t(`ranking.sort.${value}`) })))

const { data, error, loading } = useRemote(
  async () => {
    const [face, distance] = wanted.value ? wanted.value.split('|') : [undefined, undefined]
    return (
      await api.GET('/api/teams/{team_id}/ranking/', {
        params: { path: { team_id: teamId }, query: { days: Number(days.value), face, distance_m: distance === undefined ? undefined : Number(distance) } },
      })
    ).data ?? null
  },
  { watch: [days, wanted] },
)

const choices = computed(() => (data.value?.choices ?? []).map((c) => ({ value: `${c.face}|${c.distance_m}`, label: `${c.face_name} · ${formatDistance(c.distance_m)}` })))
const choice = computed({
  get: () => (data.value?.face ? `${data.value.face}|${data.value.distance_m}` : ''),
  set: (value: string) => (wanted.value = value),
})
// Archers without an average go last when sorting by it.
const rows = computed(() => {
  const list = [...(data.value?.rows ?? [])]
  if (sort.value === 'average') list.sort((a, b) => (b.average ?? -1) - (a.average ?? -1) || a.name.localeCompare(b.name))
  return list
})
</script>

<template>
  <AppPage :title="$t('ranking.title')" back>
    <div class="screen">
      <ErrorText :message="error" />
      <div v-if="loading">{{ $t('common.loading') }}</div>
      <template v-if="data">
        <ChipGroup v-model="days" :label="$t('ranking.period')" :options="periods" />
        <ChipGroup v-if="choices.length > 0" v-model="choice" :label="$t('ranking.averageOn')" :options="choices" />
        <ChipGroup v-model="sort" :label="$t('ranking.sortBy')" :options="sorts" />
        <div v-if="data.rows.length === 0">{{ $t('teams.noArchers') }}</div>
        <div v-else class="chart-card">
          <div class="d-flex gap-2 faint">
            <span class="flex-grow-1">{{ $t('ranking.archer') }}</span>
            <span class="rank-number">{{ $t('ranking.arrows') }}</span>
            <span class="rank-number">{{ $t('ranking.average') }}</span>
          </div>
          <div v-for="(row, i) in rows" :key="row.user_id" class="d-flex gap-2 py-1 align-items-baseline">
            <span class="tabular" style="width: 1.5em">{{ i + 1 }}</span>
            <span class="flex-grow-1">{{ row.name }}</span>
            <span class="rank-number tabular">{{ row.arrows }}</span>
            <span class="rank-number tabular">{{ row.average === null ? '–' : row.average.toFixed(2) }}</span>
          </div>
        </div>
        <div class="faint">{{ $t('ranking.note', { n: data.days }) }}</div>
      </template>
    </div>
  </AppPage>
</template>

<style scoped>
.rank-number { width: 4.5em; text-align: right; }
</style>
