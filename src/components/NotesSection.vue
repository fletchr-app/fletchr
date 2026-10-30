<script setup lang="ts">
import NoteRow from '@/components/NoteRow.vue'
import NewNote from '@/components/NewNote.vue'
import PendingNotes from '@/components/PendingNotes.vue'
import ErrorText from '@/components/ErrorText.vue'
import { useAuth } from '@/composables/useAuth'
import { useNotes } from '@/composables/useNotes'
import { useRemote } from '@/composables/useRemote'
import { noteLink } from '@/lib/media-notes'
import type { EventLink } from '@/lib/schedule'
import { computed, watch } from 'vue'
import { useRouter } from 'vue-router'

const REFRESH_MS = 10000
const always = () => true

// Coach notes about an archer, or about one of their sessions. Coaches see all notes of their team and can
// write new ones (coach only unless they choose otherwise); an archer sees the notes shared with them.
const props = withDefaults(defineProps<{ archerId: number; sessionId?: string; ends?: { id: string; index: number }[]; event?: EventLink | null }>(), { ends: () => [] })

const { api, userId } = useAuth()
// Your own training: you write private notes for yourself, no team involved.
const own = computed(() => props.archerId === Number(userId.value))
const router = useRouter()
// A note on a photo or a frame opens its photo or clip; to change the drawing it goes there too, and starts drawing.
const open = (note: { media?: string | null; frame?: number | null }) => {
  const link = noteLink(note)
  if (link) void router.push(link)
}
const draw = (note: { id: number; media?: string | null; frame?: number | null }) => {
  const link = noteLink(note)
  if (link) void router.push(`${link}${link.includes('?') ? '&' : '?'}draw=${note.id}`)
}
const notes = useRemote(
  async () => (await api.GET('/api/notes/', { params: { query: { archer: props.archerId, session: props.sessionId } } })).data ?? null,
  { pollMs: REFRESH_MS, keepPolling: always },
)
const teams = useRemote(async () => (await api.GET('/api/notes/teams/', { params: { query: { archer: props.archerId } } })).data ?? null)
// A note written here goes up in the background; when it has, the server's list has it.
const { uploaded, pendingFor } = useNotes()
watch(uploaded, notes.reload)
</script>

<template>
  <div
    v-if="own || notes.data.value?.length || teams.data.value?.length || pendingFor({ archer: archerId, session: sessionId }).length"
    class="d-flex flex-column gap-3"
  >
    <h2 class="h5 m-0">{{ own ? $t('notes.myNotes') : $t('notes.coachNotes') }}</h2>
    <ErrorText :message="notes.error.value" />
    <NewNote
      v-if="own || (teams.data.value && teams.data.value.length > 0)"
      :archer-id="archerId"
      :session-id="sessionId"
      :ends="ends"
      :event="event"
      :teams="teams.data.value ?? []"
      @added="notes.reload"
    />
    <PendingNotes :archer-id="archerId" :session-id="sessionId" />
    <NoteRow
      v-for="note in notes.data.value"
      :key="note.id"
      :note="note"
      :ends="ends"
      picture
      @changed="notes.reload"
      @jump="open(note)"
      @open="open"
      @edit-drawing="draw"
    />
  </div>
</template>
