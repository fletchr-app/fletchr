<script setup lang="ts">
import AppPage from '@/components/AppPage.vue'
import { computed } from 'vue'

import ErrorText from '@/components/ErrorText.vue'
import TeamOverview from '@/components/TeamOverview.vue'
import { useAuth } from '@/composables/useAuth'
import { useRemote } from '@/composables/useRemote'

const { api } = useAuth()
const { data, error } = useRemote(async () => (await api.GET('/api/teams/')).data ?? null)
const coached = computed(() => (data.value ?? []).filter((t) => t.my_role !== 'archer'))
</script>

<template>
  <AppPage title="Team">
    <div class="screen">
      <ErrorText :message="error" />
      <div v-if="data && coached.length === 0">You are not a coach in any team.</div>
      <TeamOverview v-for="team in coached" :key="team.id" :team="team" />
    </div>
  </AppPage>
</template>
