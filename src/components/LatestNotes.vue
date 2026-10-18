<script setup lang="ts">
import { useAuth } from '@/composables/useAuth'
import { useRemote } from '@/composables/useRemote'

const SHOWN = 5

// The newest notes your coaches wrote about you and shared with you.
const props = defineProps<{ userId: number }>()
const { api } = useAuth()
const { data } = useRemote(async () => (await api.GET('/api/notes/', { params: { query: { archer: props.userId, visibility: 'shared' } } })).data ?? null)
</script>

<template>
  <div v-if="data?.length" class="d-flex flex-column gap-2">
    <div class="fw-semibold">From your coaches</div>
    <div v-for="note in data.slice(0, SHOWN)" :key="note.id">
      <div class="muted">{{ note.author_name }} · {{ new Date(note.created_at).toLocaleDateString() }}</div>
      <div>{{ note.body }}</div>
    </div>
  </div>
</template>
