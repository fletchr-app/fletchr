<script setup lang="ts">
import { IonModal } from '@ionic/vue'

import ErrorText from '@/components/ErrorText.vue'
import NewNote from '@/components/NewNote.vue'
import NoteRow from '@/components/NoteRow.vue'
import PendingNotes from '@/components/PendingNotes.vue'
import type { components } from '@/lib/api-types'
import type { Shape } from '@/lib/drawing'

type Note = components['schemas']['Note']

// The sheet with the notes on a photo or a clip: the drawing that waits for its note, the form for a new note, the list.
defineProps<{
  open: boolean
  title: string
  empty: string
  error: string | null
  notes: Note[]
  attached: Shape[]
  archerId?: number
  teams: { id: number; name: string }[]
  canWrite: boolean
  on?: { mediaId: string; frame?: number; timeMs?: number; drawing?: { v: 1; shapes: Shape[] } | null }
}>()
const emit = defineEmits<{ close: []; removeAttached: []; added: []; changed: []; jump: [frame: number]; editDrawing: [note: Note] }>()
</script>

<template>
  <IonModal :is-open="open" :initial-breakpoint="0.7" :breakpoints="[0, 0.7, 1]" @did-dismiss="emit('close')">
    <div class="screen sheet">
      <h2 class="h5 m-0">{{ title }}</h2>
      <ErrorText :message="error" />
      <div v-if="attached.length > 0" class="d-flex align-items-center justify-content-between gap-2">
        <span>{{ $t('media.drawingAttached', { n: attached.length }) }}</span>
        <button type="button" class="text" @click="emit('removeAttached')">{{ $t('media.drawingRemove') }}</button>
      </div>
      <NewNote v-if="archerId !== undefined && canWrite" :archer-id="archerId" :ends="[]" :teams="teams" :on="on" @added="emit('added')" />
      <PendingNotes v-if="archerId !== undefined && on" :archer-id="archerId" :media-id="on.mediaId" />
      <div v-if="notes.length === 0" class="muted">{{ empty }}</div>
      <NoteRow v-for="n in notes" :key="n.id" :note="n" :ends="[]" @changed="emit('changed')" @jump="emit('jump', $event)" @edit-drawing="emit('editDrawing', $event)" />
    </div>
  </IonModal>
</template>

<style scoped>
.sheet {
  overflow-y: auto;
  height: 100%;
}
.text {
  border: 0;
  background: transparent;
  color: var(--ion-color-primary);
  font-weight: 600;
}
</style>
