<script setup lang="ts">
import AppButton from '@/components/AppButton.vue'
import AppPage from '@/components/AppPage.vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'

import ErrorText from '@/components/ErrorText.vue'
import InvitesSection from '@/components/InvitesSection.vue'
import MembersSection from '@/components/MembersSection.vue'
import TeamLeaveDelete from '@/components/TeamLeaveDelete.vue'
import TeamRename from '@/components/TeamRename.vue'
import { useAuth } from '@/composables/useAuth'
import { useRemote } from '@/composables/useRemote'

const REFRESH_MS = 15000
const always = () => true

// One team: its members, and for admins the invites and the team name.
const { t } = useI18n()
const route = useRoute()
const teamId = Number(route.params.id)
const { api, userId } = useAuth()
const poll = { pollMs: REFRESH_MS, keepPolling: always }

const team = useRemote(async () => (await api.GET('/api/teams/{team_id}/', { params: { path: { team_id: teamId } } })).data ?? null, poll)
const members = useRemote(async () => (await api.GET('/api/teams/{team_id}/members/', { params: { path: { team_id: teamId } } })).data ?? null, poll)
const isAdmin = computed(() => team.data.value?.my_role === 'admin')
const isCoach = computed(() => isAdmin.value || team.data.value?.my_role === 'coach')
const invites = useRemote(async () => {
  if (!isAdmin.value) return []
  return (await api.GET('/api/teams/{team_id}/invites/', { params: { path: { team_id: teamId } } })).data ?? null
}, { ...poll, watch: [isAdmin] })

const title = computed(() => team.data.value?.name ?? t('team.title'))

// After a change, fetch everything again.
function reload() {
  team.reload()
  members.reload()
  invites.reload()
}
</script>

<template>
  <AppPage :title="title">
    <div class="screen">
      <ErrorText :message="team.error.value ?? members.error.value" />
      <div v-if="team.loading.value">{{ $t('common.loading') }}</div>
      <template v-if="team.data.value">
        <TeamRename v-if="isAdmin" :key="team.data.value.name" :team-id="teamId" :name="team.data.value.name" @changed="reload" />
        <MembersSection
          v-if="members.data.value"
          :team-id="teamId"
          :members="members.data.value"
          :is-admin="isAdmin"
          :my-id="userId === null ? null : Number(userId)"
          @changed="reload"
        />
        <AppButton v-if="isCoach" secondary :router-link="`/team/${teamId}/forms`">{{ $t('evaluations.formsTitle') }}</AppButton>
        <AppButton v-if="isCoach" secondary :router-link="`/team/${teamId}/progress`">{{ $t('progress.teamTitle') }}</AppButton>
        <InvitesSection v-if="isAdmin && invites.data.value" :team-id="teamId" :team-name="team.data.value.name" :invites="invites.data.value" @changed="reload" />
        <TeamLeaveDelete :team-id="teamId" :team-name="team.data.value.name" :is-admin="isAdmin" />
      </template>
    </div>
  </AppPage>
</template>
