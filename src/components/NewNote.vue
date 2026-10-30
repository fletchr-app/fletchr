<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import AppButton from '@/components/AppButton.vue'
import ChipGroup from '@/components/ChipGroup.vue'
import ErrorText from '@/components/ErrorText.vue'
import FormField from '@/components/FormField.vue'
import { useAuth } from '@/composables/useAuth'
import { useNotes } from '@/composables/useNotes'
import type { Shape } from '@/lib/drawing'

type Visibility = 'private' | 'coach_only' | 'shared'
const { t } = useI18n()
const VISIBILITY = computed<{ value: Visibility; label: string }[]>(() => [
  { value: 'private', label: t('notes.private') },
  { value: 'coach_only', label: t('notes.coachOnly') },
  { value: 'shared', label: t('notes.shared') },
])

const props = defineProps<{
  archerId: number
  sessionId?: string
  ends: { id: string; index: number }[]
  teams: { id: number; name: string }[]
  /** A note on a photo (only `mediaId`), or on one frame of a clip: the frame (from 0) and where it is in the clip. */
  on?: { mediaId: string; frame?: number; timeMs?: number; drawing?: { v: 1; shapes: Shape[] } | null }
}>()
const emit = defineEmits<{ added: [] }>()

// The note is saved on the device and goes up as soon as it can, after the photo or session it is about.
const { add: queueNote } = useNotes()
// A note about yourself has no team and nobody else reads it.
const { userId } = useAuth()
const own = computed(() => props.archerId === Number(userId.value))
const body = ref('')
const visibility = ref<Visibility>('coach_only')
const endId = ref('')
const teamId = ref(String(props.teams[0]?.id ?? ''))
const error = ref<string | null>(null)

const label = computed(() => {
  if (!props.on) return t('notes.newNote')
  return props.on.frame === undefined ? t('notes.newNoteOnPhoto') : t('notes.newNoteOnFrame', { n: props.on.frame + 1 })
})

function add() {
  error.value = null
  const text = body.value.trim()
  if (!text) return (error.value = t('notes.noteEmpty'))
  queueNote({
    archer: props.archerId,
    team: own.value ? null : Number(teamId.value),
    body: text,
    visibility: own.value ? 'private' : visibility.value,
    session: props.sessionId ?? null,
    end: endId.value || null,
    media: props.on?.mediaId ?? null,
    frame: props.on?.frame ?? null,
    time_ms: props.on?.timeMs ?? null,
    drawing: props.on?.drawing ?? null,
  })
  body.value = ''
  endId.value = ''
  emit('added')
}
</script>

<template>
  <div class="d-flex flex-column gap-2">
    <FormField v-model="body" :label="label" multiline capitalize="sentences" />
    <ChipGroup v-if="!own" v-model="visibility" :label="$t('notes.whoCanRead')" :options="VISIBILITY" />
    <ChipGroup
      v-if="ends.length > 0"
      v-model="endId"
      :label="$t('notes.about')"
      :options="[{ value: '', label: $t('notes.wholeSession') }, ...ends.map((e) => ({ value: e.id, label: $t('notes.end', { n: e.index + 1 }) }))]"
    />
    <ChipGroup v-if="!own && teams.length > 1" v-model="teamId" :label="$t('notes.team')" :options="teams.map((x) => ({ value: String(x.id), label: x.name }))" />
    <ErrorText :message="error" />
    <AppButton @click="add">{{ $t('notes.add') }}</AppButton>
  </div>
</template>
