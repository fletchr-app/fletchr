<script setup lang="ts">
import { onIonViewWillEnter } from '@ionic/vue'
import { computed } from 'vue'
import { useRoute } from 'vue-router'

import AppPage from '@/components/AppPage.vue'
import ErrorText from '@/components/ErrorText.vue'
import { useAuth } from '@/composables/useAuth'
import { useRemote } from '@/composables/useRemote'
import { type Evaluated, teamAverages } from '@/lib/progress'

// How the archers of a team are rated: for every criterion the mean of each archer's newest coach evaluation. Coaches only.
const route = useRoute()
const { api } = useAuth()
const teamId = Number(route.params.id)

const list = useRemote(async () => (await api.GET('/api/evaluations/', { params: { query: { team: teamId, kind: 'coach' } } })).data ?? null)
let first = true
onIonViewWillEnter(() => (first ? (first = false) : list.reload()))

const team = computed(() => teamAverages((list.data.value ?? []) as unknown as (Evaluated & { archer: number })[]))
</script>

<template>
  <AppPage :title="$t('progress.teamTitle')">
    <div class="screen">
      <ErrorText :message="list.error.value" />
      <div v-if="list.loading.value && !list.data.value">{{ $t('common.loading') }}</div>
      <div v-else-if="team.groups.length === 0">{{ $t('progress.teamEmpty') }}</div>
      <template v-else>
        <div class="muted">{{ $t('progress.teamBasis', { n: team.archers }, team.archers) }}</div>
        <div v-for="g in team.groups" :key="g.group" class="chart-card">
          <div class="d-flex justify-content-between gap-2">
            <span class="chart-title">{{ g.group }}</span><span class="tabular">Ø {{ g.mean }}</span>
          </div>
          <div v-for="c in g.criteria" :key="c.key" class="d-flex justify-content-between gap-2">
            <span>{{ c.label }}</span><span class="tabular text-nowrap">{{ c.mean }} <span class="muted">({{ c.archers }})</span></span>
          </div>
        </div>
      </template>
    </div>
  </AppPage>
</template>
