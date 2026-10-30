<script setup lang="ts">
import AppPage from '@/components/AppPage.vue'
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'

import EndRows from '@/components/EndRows.vue'
import ErrorText from '@/components/ErrorText.vue'
import NotesSection from '@/components/NotesSection.vue'
import SessionDetailsText from '@/components/SessionDetailsText.vue'
import SessionPlots from '@/components/SessionPlots.vue'
import UnattachedHint from '@/components/UnattachedHint.vue'
import { useAuth } from '@/composables/useAuth'
import { useRemote } from '@/composables/useRemote'
import { useUnits } from '@/composables/useUnits'
import { gearLine, sessionTotals, sessionTypeKey, usesEnds } from '@/lib/log-model'
import { fromServer } from '@/lib/session-view'

const REFRESH_MS = 5000

// A session as the server has it, read-only. Used for sessions from other devices and by coaches.
const route = useRoute()
const { formatDistance } = useUnits()
const { api, userId } = useAuth()
const id = route.params.id as string
// An unfinished session is still being shot: keep fetching it, so a coach watches it fill up.
const { data, error, loading } = useRemote(
  async () => (await api.GET('/api/sessions/{session_id}/', { params: { path: { session_id: id } } })).data ?? null,
  { pollMs: REFRESH_MS, keepPolling: (s) => !s.ended_at },
)
const session = computed(() => (data.value ? fromServer(data.value) : null))
const totals = computed(() => (session.value ? sessionTotals(session.value) : null))
// Photos of this session; a coach adds them for the archer.
const mediaLink = computed(() => ({
  path: '/media',
  query: { session: id, ...(data.value && data.value.owner !== Number(userId.value) ? { owner: data.value.owner, name: session.value?.owner_name } : {}) },
}))
</script>

<template>
  <AppPage :title="$t('session.title')">
    <div v-if="!data || !session || !totals" class="screen">
      <div v-if="loading">{{ $t('common.loading') }}</div>
      <ErrorText :message="error" />
    </div>
    <div v-else class="screen">
      <h2 class="h5 m-0">{{ session.owner_name }} · {{ $t(sessionTypeKey(session.type)) }}</h2>
      <div class="muted">
        {{ new Date(session.started_at).toLocaleString() }}{{ session.location ? ` · ${session.location}` : '' }}{{ session.ended_at ? ` · ${$t('session.finished')}` : ` · ${$t('training.inProgress')}` }}
      </div>
      <div v-if="data.opened_by_name && data.opened_by !== data.owner" class="muted">{{ $t('training.openedBy', { name: data.opened_by_name }) }}</div>
      <div>{{ $t('count.arrows', totals.arrows) }}{{ usesEnds(session.type) ? ` · ${$t('count.points', totals.score)}` : '' }}</div>
      <div v-if="data.event_info">{{ $t('event.linked', { name: data.event_info.name || $t(`event.kind.${data.event_info.kind}`), date: new Date(data.event_info.start).toLocaleDateString() }) }}</div>
      <div v-if="session.gear">{{ $t('session.equipment', { gear: gearLine(session.gear) }) }}</div>
      <ErrorText :message="error" />
      <SessionDetailsText :details="session.details" />
      <RouterLink :to="mediaLink">{{ $t('media.link') }}</RouterLink>
      <UnattachedHint :owner="data.owner" :session="data" :event-id="data.event" :name="session.owner_name" />
      <SessionPlots :session="session" />
      <EndRows v-if="session.ends.length > 0" :ends="session.ends" :event="session.event" />
      <NotesSection :archer-id="data.owner" :session-id="data.id" :ends="session.ends" :event="session.event" />
      <div v-for="v in session.volume" :key="v.id">{{ $t('volume.entry', { n: v.arrow_count, d: formatDistance(v.distance_m) }, v.arrow_count) }}</div>
    </div>
  </AppPage>
</template>
