<script setup lang="ts">
import { ref } from 'vue'

import AppButton from '@/components/AppButton.vue'
import ChipGroup from '@/components/ChipGroup.vue'
import ErrorText from '@/components/ErrorText.vue'
import FormField from '@/components/FormField.vue'
import { useAuth } from '@/composables/useAuth'
import { errorMessage } from '@/lib/errors'

type Visibility = 'coach_only' | 'shared'
const VISIBILITY: { value: Visibility; label: string }[] = [
  { value: 'coach_only', label: 'Coach only' },
  { value: 'shared', label: 'Shared with the archer' },
]

const props = defineProps<{
  archerId: number
  sessionId?: string
  ends: { id: string; index: number }[]
  teams: { id: number; name: string }[]
}>()
const emit = defineEmits<{ added: [] }>()

const { api } = useAuth()
const body = ref('')
const visibility = ref<Visibility>('coach_only')
const endId = ref('')
const teamId = ref(String(props.teams[0]!.id))
const error = ref<string | null>(null)
const busy = ref(false)

async function add() {
  busy.value = true
  error.value = null
  try {
    const { data, error: failure } = await api.POST('/api/notes/', {
      body: {
        archer: props.archerId,
        team: Number(teamId.value),
        body: body.value,
        visibility: visibility.value,
        session: props.sessionId ?? null,
        end: endId.value || null,
      },
    })
    if (data) {
      body.value = ''
      endId.value = ''
      emit('added')
    } else error.value = errorMessage(failure)
  } catch {
    error.value = 'Server not reachable'
  }
  busy.value = false
}
</script>

<template>
  <div class="d-flex flex-column gap-2">
    <FormField v-model="body" label="New note" multiline capitalize="sentences" />
    <ChipGroup v-model="visibility" label="Who can read it" :options="VISIBILITY" />
    <ChipGroup
      v-if="ends.length > 0"
      v-model="endId"
      label="About"
      :options="[{ value: '', label: 'Whole session' }, ...ends.map((e) => ({ value: e.id, label: `End ${e.index + 1}` }))]"
    />
    <ChipGroup v-if="teams.length > 1" v-model="teamId" label="Team" :options="teams.map((t) => ({ value: String(t.id), label: t.name }))" />
    <ErrorText :message="error" />
    <AppButton :busy="busy" @click="add">Add note</AppButton>
  </div>
</template>
