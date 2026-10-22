<script setup lang="ts">
import { alertController } from '@ionic/vue'
import { ref } from 'vue'

import AppButton from '@/components/AppButton.vue'
import ErrorText from '@/components/ErrorText.vue'
import { useAuth } from '@/composables/useAuth'
import { errorMessage } from '@/lib/errors'

// A coach adds an archer who has no account (yet): a profile for notes and sessions, which the archer can take over later.
const props = defineProps<{ teamId: number }>()
const emit = defineEmits<{ added: [] }>()

const { api } = useAuth()
const error = ref<string | null>(null)

async function add(name: string) {
  error.value = null
  try {
    const { data, error: failure } = await api.POST('/api/teams/{team_id}/archers/', { params: { path: { team_id: props.teamId } }, body: { name } })
    if (data) emit('added')
    else error.value = errorMessage(failure)
  } catch {
    error.value = 'Server not reachable'
  }
}

async function ask() {
  const alert = await alertController.create({
    header: 'Add an archer',
    message: 'For someone without an account. You can write notes and log sessions for them, and link their account later.',
    inputs: [{ name: 'name', type: 'text', placeholder: 'Name', attributes: { autocapitalize: 'words' } }],
    buttons: [
      { text: 'Cancel', role: 'cancel' },
      { text: 'Add', handler: (value: { name?: string }) => !!value.name?.trim() && void add(value.name.trim()) },
    ],
  })
  await alert.present()
}
</script>

<template>
  <div class="d-flex flex-column gap-2">
    <AppButton secondary @click="ask">Add an archer without an account</AppButton>
    <ErrorText :message="error" />
  </div>
</template>
