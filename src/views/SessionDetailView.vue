<script setup lang="ts">
import AppPage from '@/components/AppPage.vue'
import { computed } from 'vue'
import { useRoute } from 'vue-router'

import EndRows from '@/components/EndRows.vue'
import ErrorText from '@/components/ErrorText.vue'
import NotesSection from '@/components/NotesSection.vue'
import SessionPlots from '@/components/SessionPlots.vue'
import { useAuth } from '@/composables/useAuth'
import { useRemote } from '@/composables/useRemote'
import { gearLine, sessionTotals, usesEnds } from '@/lib/log-model'
import { fromServer } from '@/lib/session-view'

const REFRESH_MS = 5000

// A session as the server has it, read-only. Used for sessions from other devices and by coaches.
const route = useRoute()
const { api } = useAuth()
const id = route.params.id as string
// An unfinished session is still being shot: keep fetching it, so a coach watches it fill up.
const { data, error, loading } = useRemote(
  async () => (await api.GET('/api/sessions/{session_id}/', { params: { path: { session_id: id } } })).data ?? null,
  { pollMs: REFRESH_MS, keepPolling: (s) => !s.ended_at },
)
const session = computed(() => (data.value ? fromServer(data.value) : null))
const totals = computed(() => (session.value ? sessionTotals(session.value) : null))
</script>

<template>
  <AppPage :title="$t('session.title')">
    <div v-if="!data || !session || !totals" class="screen">
      <div v-if="loading">{{ $t('common.loading') }}</div>
      <ErrorText :message="error" />
    </div>
    <div v-else class="screen">
      <h2 class="h5 m-0">{{ session.owner_name }} · {{ $t(`sessionType.${session.type}`) }}</h2>
      <div class="muted">
        {{ new Date(session.started_at).toLocaleString() }}{{ session.location ? ` · ${session.location}` : '' }}{{ session.ended_at ? ` · ${$t('session.finished')}` : ` · ${$t('training.inProgress')}` }}
      </div>
      <div>{{ $t('count.arrows', totals.arrows) }}{{ usesEnds(session.type) ? ` · ${$t('count.points', totals.score)}` : '' }}</div>
      <div v-if="session.gear">{{ $t('session.equipment', { gear: gearLine(session.gear) }) }}</div>
      <ErrorText :message="error" />
      <SessionPlots :session="session" />
      <EndRows v-if="session.ends.length > 0" :ends="session.ends" />
      <NotesSection :archer-id="data.owner" :session-id="data.id" :ends="session.ends" />
      <div v-for="v in session.volume" :key="v.id">{{ $t('volume.entry', { n: v.arrow_count, d: Number(v.distance_m) }, v.arrow_count) }}</div>
    </div>
  </AppPage>
</template>
