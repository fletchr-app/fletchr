<script setup lang="ts">
import NoteRow from '@/components/NoteRow.vue'
import NewNote from '@/components/NewNote.vue'
import ErrorText from '@/components/ErrorText.vue'
import { useAuth } from '@/composables/useAuth'
import { useRemote } from '@/composables/useRemote'

const REFRESH_MS = 10000
const always = () => true

// Coach notes about an archer, or about one of their sessions. Coaches see all notes of their team and can
// write new ones (coach only unless they choose otherwise); an archer sees the notes shared with them.
const props = withDefaults(defineProps<{ archerId: number; sessionId?: string; ends?: { id: string; index: number }[] }>(), { ends: () => [] })

const { api } = useAuth()
const notes = useRemote(
  async () => (await api.GET('/api/notes/', { params: { query: { archer: props.archerId, session: props.sessionId } } })).data ?? null,
  { pollMs: REFRESH_MS, keepPolling: always },
)
const teams = useRemote(async () => (await api.GET('/api/notes/teams/', { params: { query: { archer: props.archerId } } })).data ?? null)
</script>

<template>
  <div v-if="notes.data.value?.length || teams.data.value?.length" class="d-flex flex-column gap-3">
    <h2 class="h5 m-0">{{ $t('notes.coachNotes') }}</h2>
    <ErrorText :message="notes.error.value" />
    <NewNote
      v-if="teams.data.value && teams.data.value.length > 0"
      :archer-id="archerId"
      :session-id="sessionId"
      :ends="ends"
      :teams="teams.data.value"
      @added="notes.reload"
    />
    <NoteRow v-for="note in notes.data.value" :key="note.id" :note="note" :ends="ends" @changed="notes.reload" />
  </div>
</template>
