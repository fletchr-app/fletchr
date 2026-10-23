<script setup lang="ts">
import { alertController } from '@ionic/vue'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

import AppButton from '@/components/AppButton.vue'
import ErrorText from '@/components/ErrorText.vue'
import { useAuth } from '@/composables/useAuth'
import { errorMessage } from '@/lib/errors'

// A coach adds an archer who has no account (yet): a profile for notes and sessions, which the archer can take over later.
const props = defineProps<{ teamId: number }>()
const emit = defineEmits<{ added: [] }>()

const { t } = useI18n()
const { api } = useAuth()
const error = ref<string | null>(null)

async function add(name: string) {
  error.value = null
  try {
    const { data, error: failure } = await api.POST('/api/teams/{team_id}/archers/', { params: { path: { team_id: props.teamId } }, body: { name } })
    if (data) emit('added')
    else error.value = errorMessage(failure)
  } catch {
    error.value = t('common.serverNotReachable')
  }
}

async function ask() {
  const alert = await alertController.create({
    header: t('teams.addArcherHeader'),
    message: t('teams.addArcherMessage'),
    inputs: [{ name: 'name', type: 'text', placeholder: t('teams.namePlaceholder'), attributes: { autocapitalize: 'words' } }],
    buttons: [
      { text: t('common.cancel'), role: 'cancel' },
      { text: t('teams.add'), handler: (value: { name?: string }) => !!value.name?.trim() && void add(value.name.trim()) },
    ],
  })
  await alert.present()
}
</script>

<template>
  <div class="d-flex flex-column gap-2">
    <AppButton secondary @click="ask">{{ $t('teams.addArcher') }}</AppButton>
    <ErrorText :message="error" />
  </div>
</template>
