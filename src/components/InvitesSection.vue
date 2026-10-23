<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import AppButton from '@/components/AppButton.vue'
import ChipGroup from '@/components/ChipGroup.vue'
import ErrorText from '@/components/ErrorText.vue'
import InviteRow from '@/components/InviteRow.vue'
import { useAuth } from '@/composables/useAuth'
import type { components } from '@/lib/api-types'
import { errorMessage } from '@/lib/errors'
import { TEAM_ROLES, type TeamRole } from '@/lib/team-admin'

type Invite = components['schemas']['Invite']

// Open invites of a team, and a form for a new one. Admins only.
const props = defineProps<{ teamId: number; teamName: string; invites: Invite[] }>()
const emit = defineEmits<{ changed: [] }>()

const { t } = useI18n()
const { api } = useAuth()
const roleOptions = computed(() => TEAM_ROLES.map((value) => ({ value, label: t(`roles.${value}`) })))
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
    error.value = t('common.serverNotReachable')
  }
  busy.value = false
}
</script>

<template>
  <div class="d-flex flex-column gap-3">
    <h2 class="h5 m-0">{{ $t('teams.invites') }}</h2>
    <div class="muted">{{ $t('teams.invitesText') }}</div>
    <ChipGroup v-model="role" :label="$t('teams.newInviteFor')" :options="roleOptions" />
    <ErrorText :message="error" />
    <AppButton :busy="busy" @click="create">{{ $t('teams.createInvite', { role: $t(`roles.${role}`) }) }}</AppButton>
    <div v-if="invites.length === 0" class="muted">{{ $t('teams.noInvites') }}</div>
    <InviteRow v-for="invite in invites" :key="invite.id" :team-id="teamId" :team-name="teamName" :invite="invite" @changed="emit('changed')" />
  </div>
</template>
