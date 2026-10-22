<script setup lang="ts">
import { alertController } from '@ionic/vue'
import { ref } from 'vue'
import { useRouter } from 'vue-router'

import AppButton from '@/components/AppButton.vue'
import ErrorText from '@/components/ErrorText.vue'
import { useAuth } from '@/composables/useAuth'
import { useTeams } from '@/composables/useTeams'
import { errorMessage } from '@/lib/errors'

// Leave the team (anyone), or delete it for good (admins).
const props = defineProps<{ teamId: number; teamName: string; isAdmin: boolean }>()

const router = useRouter()
const { api } = useAuth()
const { load } = useTeams()
const path = { team_id: props.teamId }
const confirmLeave = ref(false)
const error = ref<string | null>(null)

async function run(request: () => Promise<{ response: Response; error?: unknown }>) {
  error.value = null
  try {
    const { response, error: failure } = await request()
    if (response.ok) {
      await load()
      void router.replace('/')
    } else error.value = errorMessage(failure)
  } catch {
    error.value = 'Server not reachable'
  }
}

const leave = () => run(() => api.DELETE('/api/teams/{team_id}/membership/', { params: { path } }))
const remove = () => run(() => api.DELETE('/api/teams/{team_id}/', { params: { path } }))

// Typing the name stops a slip: this erases other people's memberships, notes and profiles.
async function askDelete() {
  const alert = await alertController.create({
    header: 'Delete this team?',
    message:
      `This removes the team for everybody: all memberships, invites, the coach notes written in it and the profiles of archers ` +
      `without an account. People's own accounts, sessions and equipment stay. It cannot be undone. Type the name to confirm: ${props.teamName}`,
    inputs: [{ name: 'name', type: 'text', placeholder: props.teamName }],
    buttons: [
      { text: 'Cancel', role: 'cancel' },
      { text: 'Delete', role: 'destructive', handler: (value: { name?: string }) => (value.name?.trim() === props.teamName ? void remove() : false) },
    ],
  })
  await alert.present()
}
</script>

<template>
  <div class="d-flex flex-column gap-2 mt-3">
    <AppButton secondary @click="confirmLeave ? leave() : (confirmLeave = true)">
      {{ confirmLeave ? 'Tap again to leave the team' : 'Leave team' }}
    </AppButton>
    <AppButton v-if="isAdmin" secondary @click="askDelete">Delete team</AppButton>
    <ErrorText :message="error" />
  </div>
</template>
