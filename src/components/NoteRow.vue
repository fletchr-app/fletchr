<script setup lang="ts">
import { IonButton } from '@ionic/vue'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'

import AppButton from '@/components/AppButton.vue'
import ChipGroup from '@/components/ChipGroup.vue'
import DrawnPicture from '@/components/DrawnPicture.vue'
import ErrorText from '@/components/ErrorText.vue'
import FormField from '@/components/FormField.vue'
import { useAuth } from '@/composables/useAuth'
import type { components } from '@/lib/api-types'
import { errorMessage } from '@/lib/errors'
import { drawnShapes } from '@/lib/media-notes'
import { clock } from '@/lib/player'

type Note = components['schemas']['Note']
type Visibility = 'private' | 'coach_only' | 'shared'
const { t } = useI18n()
const VISIBILITY = computed<{ value: Visibility; label: string }[]>(() => [
  { value: 'private', label: t('notes.private') },
  { value: 'coach_only', label: t('notes.coachOnly') },
  { value: 'shared', label: t('notes.shared') },
])

// `picture`: show the photo of a photo note with its drawing (not where the photo is on screen already).
const props = defineProps<{ note: Note; ends: { id: string; index: number }[]; picture?: boolean }>()
const emit = defineEmits<{ changed: []; jump: [frame: number]; editDrawing: [note: Note]; open: [note: Note] }>()

const { api } = useAuth()
const editing = ref(false)
const body = ref(props.note.body)
const visibility = ref<Visibility>(props.note.visibility ?? 'coach_only')
const confirmDelete = ref(false)
const error = ref<string | null>(null)
const isPhoto = computed(() => props.note.picture?.kind === 'photo')
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
    error.value = t('common.serverNotReachable')
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
      {{ note.author_name }} · {{ new Date(note.created_at).toLocaleDateString() }} · {{ note.visibility === 'shared' ? $t('notes.labelShared') : note.visibility === 'private' ? $t('notes.labelPrivate') : $t('notes.labelCoachOnly')
      }}{{ endIndex !== undefined ? ` · ${$t('notes.labelEnd', { n: endIndex + 1 })}` : '' }}
    </div>
    <template v-if="editing">
      <FormField v-model="body" :label="$t('notes.note')" multiline capitalize="sentences" />
      <ChipGroup v-model="visibility" :label="$t('notes.whoCanRead')" :options="VISIBILITY" />
      <AppButton @click="save">{{ $t('common.save') }}</AppButton>
      <AppButton secondary @click="editing = false">{{ $t('common.cancel') }}</AppButton>
    </template>
    <div v-else style="white-space: pre-wrap">{{ note.body }}</div>
    <button v-if="picture && isPhoto && note.picture" type="button" class="photo" :aria-label="$t('notes.openPhoto')" @click="emit('open', note)">
      <DrawnPicture :src="note.picture.thumbnail_url" :width="note.picture.width" :height="note.picture.height" :shapes="drawnShapes([note])" />
    </button>
    <IonButton v-if="note.frame !== null && note.frame !== undefined && !editing" fill="outline" size="small" class="m-0 align-self-start" @click="emit('jump', note.frame)">
      {{ $t('notes.frameLink', { n: note.frame + 1, time: clock((note.time_ms ?? 0) / 1000) }) }}
    </IonButton>
    <IonButton v-if="note.can_edit && note.media && !editing" fill="clear" size="small" class="m-0 align-self-start" @click="emit('editDrawing', note)">
      {{ note.drawing ? $t('notes.editDrawing') : $t('notes.addDrawing') }}
    </IonButton>
    <RouterLink v-if="note.session && !editing" :to="`/sessions/${note.session}`">{{ $t('notes.aboutSession') }}</RouterLink>
    <ErrorText :message="error" />
    <div v-if="!editing && (note.can_edit || note.can_delete)" class="d-flex gap-3">
      <IonButton v-if="note.can_edit" fill="clear" size="small" class="m-0" @click="editing = true">{{ $t('notes.edit') }}</IonButton>
      <IonButton v-if="note.can_delete" fill="clear" size="small" class="m-0" @click="confirmDelete ? remove() : (confirmDelete = true)">{{ confirmDelete ? $t('notes.deleteConfirm') : $t('common.delete') }}</IonButton>
    </div>
  </div>
</template>

<style scoped>
.photo {
  width: 100%;
  max-width: 240px;
  padding: 0;
  border: 0;
  background: transparent;
}
</style>
