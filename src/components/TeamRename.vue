<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

import AppButton from '@/components/AppButton.vue'
import ErrorText from '@/components/ErrorText.vue'
import FormField from '@/components/FormField.vue'
import { useAuth } from '@/composables/useAuth'
import { errorMessage } from '@/lib/errors'

const { t } = useI18n()
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
    error.value = t('common.serverNotReachable')
  }
}
</script>

<template>
  <div class="d-flex flex-column gap-2">
    <FormField v-model="draft" :label="$t('teams.teamName')" capitalize="words" @enter="save" />
    <ErrorText :message="error" />
    <AppButton v-if="draft.trim() !== name" @click="save">{{ $t('teams.saveName') }}</AppButton>
  </div>
</template>
