<script setup lang="ts">
import { computed, ref } from 'vue'

import AppButton from '@/components/AppButton.vue'
import ChipGroup from '@/components/ChipGroup.vue'
import ErrorText from '@/components/ErrorText.vue'
import { useAuth } from '@/composables/useAuth'
import type { components } from '@/lib/api-types'
import { errorMessage } from '@/lib/errors'
import { roleChangeWarning, roleLabel, TEAM_ROLES, type TeamRole } from '@/lib/team-admin'

type Member = components['schemas']['Member']

const props = defineProps<{ teamId: number; member: Member; isMe: boolean }>()
const emit = defineEmits<{ changed: [] }>()

const { api } = useAuth()
const role = ref<TeamRole>(props.member.role as TeamRole)
const confirmRemove = ref(false)
const error = ref<string | null>(null)
const warning = computed(() => roleChangeWarning(props.member.role as TeamRole, role.value))

async function run(action: () => Promise<{ ok: boolean; error?: unknown }>) {
  error.value = null
  try {
    const result = await action()
    if (result.ok) emit('changed')
    else error.value = errorMessage(result.error)
  } catch {
    error.value = 'Server not reachable'
  }
}
const changeRole = () =>
  run(async () => {
    const { data, error: failure } = await api.PATCH('/api/teams/{team_id}/members/{user_id}/', {
      params: { path: { team_id: props.teamId, user_id: props.member.user_id } },
      body: { role: role.value },
    })
    return { ok: !!data, error: failure }
  })
const remove = () =>
  run(async () => {
    const { response, error: failure } = await api.DELETE('/api/teams/{team_id}/members/{user_id}/', {
      params: { path: { team_id: props.teamId, user_id: props.member.user_id } },
    })
    return { ok: response.ok, error: failure }
  })
</script>

<template>
  <div class="d-flex flex-column gap-2 ps-3 border-start border-2">
    <ChipGroup v-model="role" label="Role" :options="TEAM_ROLES" />
    <div v-if="warning" style="opacity: 0.8">{{ warning }}</div>
    <AppButton v-if="warning" @click="changeRole">Make {{ member.name || member.email }} {{ roleLabel(role).toLowerCase() }}</AppButton>
    <AppButton v-if="!isMe" secondary @click="confirmRemove ? remove() : (confirmRemove = true)">
      {{ confirmRemove ? 'Tap again to remove from the team' : 'Remove from the team' }}
    </AppButton>
    <ErrorText :message="error" />
  </div>
</template>
