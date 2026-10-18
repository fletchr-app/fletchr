<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'

import AppButton from '@/components/AppButton.vue'
import ChipGroup from '@/components/ChipGroup.vue'
import ErrorText from '@/components/ErrorText.vue'
import FormField from '@/components/FormField.vue'
import { useAuth } from '@/composables/useAuth'
import type { components } from '@/lib/api-types'
import { errorMessage } from '@/lib/errors'

type Note = components['schemas']['Note']
type Visibility = 'coach_only' | 'shared'
const VISIBILITY: { value: Visibility; label: string }[] = [
  { value: 'coach_only', label: 'Coach only' },
  { value: 'shared', label: 'Shared with the archer' },
]

const props = defineProps<{ note: Note; ends: { id: string; index: number }[] }>()
const emit = defineEmits<{ changed: [] }>()

const { api } = useAuth()
const editing = ref(false)
const body = ref(props.note.body)
const visibility = ref<Visibility>(props.note.visibility ?? 'coach_only')
const confirmDelete = ref(false)
const error = ref<string | null>(null)
const endIndex = computed(() => props.ends.find((e) => e.id === props.note.end)?.index)

async function run(action: () => Promise<{ ok: boolean; error?: unknown }>) {
  error.value = null
  try {
    const result = await action()
    if (result.ok) {
      editing.value = false
      emit('changed')
    } else error.value = errorMessage(result.error)
  } catch {
    error.value = 'Server not reachable'
  }
}
const save = () =>
  run(async () => {
    const { data, error: failure } = await api.PATCH('/api/notes/{id}/', { params: { path: { id: props.note.id } }, body: { body: body.value, visibility: visibility.value } })
    return { ok: !!data, error: failure }
  })
const remove = () =>
  run(async () => {
    const { response, error: failure } = await api.DELETE('/api/notes/{id}/', { params: { path: { id: props.note.id } } })
    return { ok: response.ok, error: failure }
  })
</script>

<template>
  <div class="d-flex flex-column gap-1 py-1">
    <div class="muted">
      {{ note.author_name }} · {{ new Date(note.created_at).toLocaleDateString() }} · {{ note.visibility === 'shared' ? 'shared' : 'coach only'
      }}{{ endIndex !== undefined ? ` · end ${endIndex + 1}` : '' }}
    </div>
    <template v-if="editing">
      <FormField v-model="body" label="Note" multiline capitalize="sentences" />
      <ChipGroup v-model="visibility" label="Who can read it" :options="VISIBILITY" />
      <AppButton @click="save">Save</AppButton>
      <AppButton secondary @click="editing = false">Cancel</AppButton>
    </template>
    <div v-else style="white-space: pre-wrap">{{ note.body }}</div>
    <RouterLink v-if="note.session && !editing" :to="`/sessions/${note.session}`">About a session</RouterLink>
    <ErrorText :message="error" />
    <div v-if="!editing && (note.can_edit || note.can_delete)" class="d-flex gap-3">
      <a v-if="note.can_edit" href="#" @click.prevent="editing = true">Edit</a>
      <a v-if="note.can_delete" href="#" @click.prevent="confirmDelete ? remove() : (confirmDelete = true)">{{ confirmDelete ? 'Tap again to delete' : 'Delete' }}</a>
    </div>
  </div>
</template>
