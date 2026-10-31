<script setup lang="ts">
import { IonButton } from '@ionic/vue'
import { computed } from 'vue'

import { useAuth } from '@/composables/useAuth'
import LocalNoteText from '@/components/LocalNoteText.vue'
import { useNotes } from '@/composables/useNotes'

// Notes written on this device that the server does not have yet, among the notes it has. They can be taken back until they are up.
const props = defineProps<{ archerId: number; sessionId?: string; mediaId?: string }>()

const { isLocal } = useAuth()
const { pendingFor, remove } = useNotes()
const pending = computed(() => pendingFor({ archer: props.archerId, session: props.sessionId, media: props.mediaId }))
</script>

<template>
  <div v-for="n in pending" :key="n.uid" class="d-flex flex-column gap-1 py-1">
    <div class="muted">{{ new Date(n.created_at).toLocaleDateString() }}{{ isLocal ? '' : ` · ${n.error ? $t('notes.refused') : $t('notes.waitingToUpload')}` }}</div>
    <LocalNoteText v-if="isLocal" :uid="n.uid" :body="n.body">
      <IonButton fill="clear" size="small" class="m-0" @click="remove(n.uid)">{{ $t('local.deleteNote') }}</IonButton>
    </LocalNoteText>
    <template v-else>
      <div style="white-space: pre-wrap">{{ n.body }}</div>
      <div v-if="n.error" class="text-danger">{{ n.error }}</div>
      <IonButton fill="clear" size="small" class="m-0 align-self-start" @click="remove(n.uid)">{{ $t('notes.takeBack') }}</IonButton>
    </template>
  </div>
</template>
