<script setup lang="ts">
import { ref } from 'vue'

import AppButton from '@/components/AppButton.vue'
import ErrorText from '@/components/ErrorText.vue'
import FormField from '@/components/FormField.vue'
import { useAuth } from '@/composables/useAuth'
import { errorMessage } from '@/lib/errors'

const props = defineProps<{ teamId: number; name: string }>()
const emit = defineEmits<{ changed: [] }>()

const { api } = useAuth()
const draft = ref(props.name)
const error = ref<string | null>(null)

async function save() {
  error.value = null
  try {
    const { data, error: failure } = await api.PATCH('/api/teams/{team_id}/', { params: { path: { team_id: props.teamId } }, body: { name: draft.value } })
    if (data) emit('changed')
    else error.value = errorMessage(failure)
  } catch {
    error.value = 'Server not reachable'
  }
}
</script>

<template>
  <div class="d-flex flex-column gap-2">
    <FormField v-model="draft" label="Team name" capitalize="words" @enter="save" />
    <ErrorText :message="error" />
    <AppButton v-if="draft.trim() !== name" @click="save">Save name</AppButton>
  </div>
</template>
