<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'

import AppButton from '@/components/AppButton.vue'
import ErrorText from '@/components/ErrorText.vue'
import LatestNotes from '@/components/LatestNotes.vue'
import { useAuth } from '@/composables/useAuth'
import type { components } from '@/lib/api-types'

type Me = components['schemas']['Me']
type Team = components['schemas']['Team']

const { api, signOut } = useAuth()
const me = ref<Me | null>(null)
const teams = ref<Team[] | null>(null)
const error = ref<string | null>(null)

onMounted(() =>
  Promise.all([api.GET('/api/me/'), api.GET('/api/teams/')])
    .then(([meRes, teamsRes]) => {
      if (meRes.data) me.value = meRes.data
      if (teamsRes.data) teams.value = teamsRes.data
      error.value = meRes.data && teamsRes.data ? null : 'Could not load your data'
    })
    .catch(() => (error.value = 'Server not reachable')),
)
</script>

<template>
  <div class="screen">
    <h2 class="h4 m-0">{{ me ? `Hello ${me.profile.name || me.email}` : 'Archery Coach' }}</h2>
    <ErrorText :message="error" />
    <LatestNotes v-if="me" :user-id="me.id" />
    <div class="fw-semibold">Your teams</div>
    <div v-if="teams?.length === 0">You are not in a team yet.</div>
    <div v-for="team in teams" :key="team.id" class="d-flex justify-content-between">
      <span>{{ team.name }}</span>
      <span class="faint">{{ team.my_role }}</span>
    </div>
    <RouterLink to="/training" class="fs-5 fw-semibold">Training</RouterLink>
    <RouterLink to="/stats" class="fs-5 fw-semibold">Statistics</RouterLink>
    <RouterLink v-if="teams?.some((t) => t.my_role !== 'archer')" to="/team" class="fs-5 fw-semibold">Team (coach)</RouterLink>
    <RouterLink to="/equipment">My equipment</RouterLink>
    <RouterLink to="/join-team">Join another team</RouterLink>
    <RouterLink to="/privacy">Your data</RouterLink>
    <RouterLink to="/settings">Server settings</RouterLink>
    <AppButton secondary @click="signOut">Sign out</AppButton>
  </div>
</template>
