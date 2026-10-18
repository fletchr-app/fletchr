<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'

import ErrorText from '@/components/ErrorText.vue'
import NotesSection from '@/components/NotesSection.vue'
import { useAuth } from '@/composables/useAuth'
import { usePageTitle } from '@/composables/usePageTitle'
import { useRemote } from '@/composables/useRemote'

const REFRESH_MS = 10000

// The sessions of one archer, for their coach.
const route = useRoute()
const id = route.params.id as string
const name = computed(() => route.query.name as string | undefined)
usePageTitle(() => name.value ?? 'Archer')

const { api } = useAuth()
const { data, error, loading } = useRemote(async () => (await api.GET('/api/sessions/', { params: { query: { owner: Number(id) } } })).data ?? null, {
  pollMs: REFRESH_MS,
  keepPolling: () => true,
})
</script>

<template>
  <div class="screen">
    <RouterLink :to="{ path: '/stats', query: { owner: id, name } }" class="fs-5 fw-semibold">Statistics</RouterLink>
    <NotesSection :archer-id="Number(id)" />
    <ErrorText :message="error" />
    <div v-if="loading">Loading…</div>
    <div v-if="data?.length === 0">No sessions yet.</div>
    <RouterLink v-for="s in data" :key="s.id" :to="`/sessions/${s.id}`" class="text-reset text-decoration-none">
      <div class="fw-semibold">{{ new Date(s.started_at).toLocaleString() }} · {{ s.type }}{{ s.ended_at ? '' : '  ● in progress' }}</div>
      <div class="muted">
        {{ s.location ? `${s.location} · ` : '' }}{{ s.ends }} ends · {{ s.scored_arrows + s.volume_arrows }} arrows{{ s.ends > 0 ? ` · ${s.score_total} points` : '' }}
      </div>
    </RouterLink>
  </div>
</template>
