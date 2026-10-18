<script setup lang="ts">
import { RouterLink } from 'vue-router'

import ErrorText from '@/components/ErrorText.vue'
import ShareTraining from '@/components/ShareTraining.vue'
import { useAuth } from '@/composables/useAuth'
import { useRemote } from '@/composables/useRemote'
import type { components } from '@/lib/api-types'

const REFRESH_MS = 10000

const props = defineProps<{ team: components['schemas']['Team'] }>()
const { api } = useAuth()
const { data, error } = useRemote(
  async () => (await api.GET('/api/teams/{team_id}/overview/', { params: { path: { team_id: props.team.id } } })).data ?? null,
  { pollMs: REFRESH_MS, keepPolling: () => true },
)
</script>

<template>
  <div class="d-flex flex-column gap-2">
    <h2 class="h5 m-0">{{ team.name }}</h2>
    <RouterLink :to="`/team/${team.id}`">{{ team.my_role === 'admin' ? 'Manage team: members, invites, name' : 'Members' }}</RouterLink>
    <ShareTraining :team="team" />
    <ErrorText :message="error" />
    <div v-if="data?.length === 0">No archers in this team yet.</div>
    <RouterLink
      v-for="archer in data"
      :key="archer.user_id"
      :to="{ path: `/archers/${archer.user_id}`, query: { name: archer.name } }"
      class="text-reset text-decoration-none"
    >
      <div class="fw-semibold">{{ archer.name }}{{ archer.role !== 'archer' ? ' (coach)' : '' }}{{ archer.last_session?.live ? '  ● shooting now' : '' }}</div>
      <div class="muted">
        {{ archer.last_session ? `Last session ${new Date(archer.last_session.started_at).toLocaleDateString()} · ${archer.last_session.type}` : 'No sessions yet' }} ·
        {{ archer.arrows_7d }} arrows in 7 days
      </div>
    </RouterLink>
  </div>
</template>
