<script setup lang="ts">
import { alertController } from '@ionic/vue'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import AppButton from '@/components/AppButton.vue'
import ErrorText from '@/components/ErrorText.vue'
import { useAuth } from '@/composables/useAuth'
import { useTeams } from '@/composables/useTeams'
import { errorMessage } from '@/lib/errors'

// Leave the team (anyone), or delete it for good (admins).
const props = defineProps<{ teamId: number; teamName: string; isAdmin: boolean }>()

const router = useRouter()
const { t } = useI18n()
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
    error.value = t('common.serverNotReachable')
  }
}

const leave = () => run(() => api.DELETE('/api/teams/{team_id}/membership/', { params: { path } }))
const remove = () => run(() => api.DELETE('/api/teams/{team_id}/', { params: { path } }))

// Typing the name stops a slip: this erases other people's memberships, notes and profiles.
async function askDelete() {
  const alert = await alertController.create({
    header: t('teams.deleteHeader'),
    message: t('teams.deleteMessage', { name: props.teamName }),
    inputs: [{ name: 'name', type: 'text', placeholder: props.teamName }],
    buttons: [
      { text: t('common.cancel'), role: 'cancel' },
      { text: t('common.delete'), role: 'destructive', handler: (value: { name?: string }) => (value.name?.trim() === props.teamName ? void remove() : false) },
    ],
  })
  await alert.present()
}
</script>

<template>
  <div class="d-flex flex-column gap-2 mt-3">
    <AppButton secondary @click="confirmLeave ? leave() : (confirmLeave = true)">
      {{ confirmLeave ? $t('teams.leaveConfirm') : $t('teams.leave') }}
    </AppButton>
    <AppButton v-if="isAdmin" secondary @click="askDelete">{{ $t('teams.delete') }}</AppButton>
    <ErrorText :message="error" />
  </div>
</template>
