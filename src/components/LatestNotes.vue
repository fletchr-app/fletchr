<script setup lang="ts">
import { useNoteLibrary } from '@/composables/useNoteLibrary'
import { useRemote } from '@/composables/useRemote'

const SHOWN = 5

// The newest notes your coaches wrote about you and shared with you.
// `refresh` goes up each time the Home screen is shown, so a note shared meanwhile appears.
const props = defineProps<{ userId: number; refresh?: number }>()
const library = useNoteLibrary()
const { data } = useRemote(() => library.list({ archer: props.userId, visibility: 'shared' }), {
  watch: [() => props.refresh],
})
</script>

<template>
  <div v-if="data?.length" class="d-flex flex-column gap-2">
    <div class="fw-semibold">{{ $t('notes.fromCoaches') }}</div>
    <div v-for="note in data.slice(0, SHOWN)" :key="note.id">
      <div class="muted">{{ note.author_name }} · {{ new Date(note.created_at).toLocaleDateString() }}</div>
      <div>{{ note.body }}</div>
    </div>
  </div>
</template>
