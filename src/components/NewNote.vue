<script setup lang="ts">
import { IonDatetime, IonDatetimeButton, IonModal } from '@ionic/vue'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import AppButton from '@/components/AppButton.vue'
import ChipGroup from '@/components/ChipGroup.vue'
import ErrorText from '@/components/ErrorText.vue'
import EventChips from '@/components/EventChips.vue'
import FormField from '@/components/FormField.vue'
import { useAgenda } from '@/composables/useAgenda'
import { useAuth } from '@/composables/useAuth'
import { useNotes } from '@/composables/useNotes'
import type { Shape } from '@/lib/drawing'
import { type EventLink, linkOf, preselected } from '@/lib/schedule'
import { startRange, toLocalValue } from '@/lib/session-time'

type Visibility = 'private' | 'coach_only' | 'shared'
const { t, locale } = useI18n()
const VISIBILITY = computed<{ value: Visibility; label: string }[]>(() => [
  { value: 'private', label: t('notes.private') },
  { value: 'coach_only', label: t('notes.coachOnly') },
  { value: 'shared', label: t('notes.shared') },
])

const props = defineProps<{
  archerId: number
  sessionId?: string
  ends: { id: string; index: number }[]
  /** The training of the session the note is on: preselected. */
  event?: EventLink | null
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

// What time the note is about: now, or earlier when it is written down afterwards. The training offered is the one that
// took place then, in the teams you may write notes in; when exactly one did it is preselected, and nothing is linked unless you confirm or choose.
// A note on a photo or frame takes the training of the photo.
const { suggest, load: loadAgenda } = useAgenda()
onMounted(() => void loadAgenda())
const earlier = ref(false)
const range = startRange(new Date())
const atLocal = ref(toLocalValue(new Date()))
const atTime = computed(() => (earlier.value ? new Date(atLocal.value) : new Date()))
const suggestions = computed(() => (own.value || props.on ? [] : suggest(atTime.value, null, { teams: props.teams.map((x) => x.id) })))
const sessionEvent = computed(() => (props.event && (props.event.team === undefined || props.event.team === null ? props.teams.some((x) => x.name === props.event!.team_name) : props.teams.some((x) => x.id === props.event!.team)) ? props.event : undefined))
const picked = ref<EventLink | null | undefined>(undefined)
const touched = ref(false)
const event = computed<EventLink | null | undefined>({
  get: () => {
    if (touched.value) return picked.value
    if (sessionEvent.value) return sessionEvent.value
    const one = preselected(suggestions.value)
    return one ? linkOf(one) : undefined
  },
  set: (link) => {
    touched.value = true
    picked.value = link
  },
})
// The note is in the team of its training.
const noteTeam = computed(() => {
  const link = event.value
  if (!link) return Number(teamId.value)
  return link.team ?? props.teams.find((x) => x.name === link.team_name)?.id ?? Number(teamId.value)
})

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
    team: own.value ? null : noteTeam.value,
    body: text,
    visibility: own.value ? 'private' : visibility.value,
    session: props.sessionId ?? null,
    end: endId.value || null,
    media: props.on?.mediaId ?? null,
    frame: props.on?.frame ?? null,
    time_ms: props.on?.timeMs ?? null,
    drawing: props.on?.drawing ?? null,
    ...(event.value ? { event: event.value } : {}),
    ...(earlier.value ? { at: atTime.value.toISOString() } : {}),
  })
  body.value = ''
  endId.value = ''
  earlier.value = false
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
    <div v-if="!own && !on">
      <a v-if="!earlier" href="#" @click.prevent="earlier = true">{{ $t('notes.aboutEarlier') }}</a>
      <div v-else class="d-flex align-items-center justify-content-between gap-2">
        <span>{{ $t('notes.aboutTime') }}</span>
        <IonDatetimeButton datetime="note-at" />
        <IonModal :keep-contents-mounted="true">
          <IonDatetime id="note-at" v-model="atLocal" :min="range.min" :max="range.max" :locale="locale" :first-day-of-week="1" />
        </IonModal>
      </div>
    </div>
    <EventChips v-if="suggestions.length > 0 || event" v-model="event" :suggestions="suggestions" />
    <ErrorText :message="error" />
    <AppButton @click="add">{{ $t('notes.add') }}</AppButton>
  </div>
</template>
