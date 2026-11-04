<script setup lang="ts">
import { alertController } from '@ionic/vue'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

import ErrorText from '@/components/ErrorText.vue'
import { useAuth } from '@/composables/useAuth'
import { errorMessage } from '@/lib/errors'

// A coach adds an archer who has no account (yet): a profile for notes and sessions, which the archer can take over later.
// The caller opens the dialog with `ask()` (the team menu); the component shows the error, if any.
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

defineExpose({ ask })
</script>

<template>
  <ErrorText :message="error" />
</template>
