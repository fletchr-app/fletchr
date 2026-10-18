<script setup lang="ts">
import { ref } from 'vue'

import AppButton from '@/components/AppButton.vue'
import ChipGroup from '@/components/ChipGroup.vue'
import ErrorText from '@/components/ErrorText.vue'
import InviteRow from '@/components/InviteRow.vue'
import { useAuth } from '@/composables/useAuth'
import type { components } from '@/lib/api-types'
import { errorMessage } from '@/lib/errors'
import { roleLabel, TEAM_ROLES, type TeamRole } from '@/lib/team-admin'

type Invite = components['schemas']['Invite']

// Open invites of a team, and a form for a new one. Admins only.
const props = defineProps<{ teamId: number; teamName: string; invites: Invite[] }>()
const emit = defineEmits<{ changed: [] }>()

const { api } = useAuth()
const role = ref<TeamRole>('archer')
const error = ref<string | null>(null)
const busy = ref(false)

async function create() {
  busy.value = true
  error.value = null
  try {
    const { data, error: failure } = await api.POST('/api/teams/{team_id}/invites/', { params: { path: { team_id: props.teamId } }, body: { role: role.value } })
    if (data) emit('changed')
    else error.value = errorMessage(failure)
  } catch {
    error.value = 'Server not reachable'
  }
  busy.value = false
}
</script>

<template>
  <div class="d-flex flex-column gap-3">
    <h2 class="h5 m-0">Invites</h2>
    <div class="muted">Someone joins with a code, once, within 14 days. They become what you choose here.</div>
    <ChipGroup v-model="role" label="New invite for a" :options="TEAM_ROLES" />
    <ErrorText :message="error" />
    <AppButton :busy="busy" @click="create">Create {{ roleLabel(role).toLowerCase() }} invite</AppButton>
    <div v-if="invites.length === 0" class="muted">No open invites.</div>
    <InviteRow v-for="invite in invites" :key="invite.id" :team-id="teamId" :team-name="teamName" :invite="invite" @changed="emit('changed')" />
  </div>
</template>
