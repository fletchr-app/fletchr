<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import AppButton from '@/components/AppButton.vue'
import ChipGroup from '@/components/ChipGroup.vue'
import ErrorText from '@/components/ErrorText.vue'
import FormField from '@/components/FormField.vue'
import { useAuth } from '@/composables/useAuth'
import type { Shape } from '@/lib/drawing'
import { errorMessage } from '@/lib/errors'

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
  /** A note on one frame of a clip: the clip, the frame (from 0) and where it is in the clip. */
  frame?: { mediaId: string; frame: number; timeMs: number; drawing?: { v: 1; shapes: Shape[] } | null }
}>()
const emit = defineEmits<{ added: [] }>()

const { api } = useAuth()
const body = ref('')
const visibility = ref<Visibility>('coach_only')
const endId = ref('')
const teamId = ref(String(props.teams[0]!.id))
const error = ref<string | null>(null)
const busy = ref(false)

async function add() {
  busy.value = true
  error.value = null
  try {
    const { data, error: failure } = await api.POST('/api/notes/', {
      body: {
        archer: props.archerId,
        team: Number(teamId.value),
        body: body.value,
        visibility: visibility.value,
        session: props.sessionId ?? null,
        end: endId.value || null,
        media: props.frame?.mediaId ?? null,
        frame: props.frame?.frame ?? null,
        time_ms: props.frame?.timeMs ?? null,
        drawing: props.frame?.drawing ?? null,
      },
    })
    if (data) {
      body.value = ''
      endId.value = ''
      emit('added')
    } else error.value = errorMessage(failure)
  } catch {
    error.value = t('common.serverNotReachable')
  }
  busy.value = false
}
</script>

<template>
  <div class="d-flex flex-column gap-2">
    <FormField v-model="body" :label="frame ? $t('notes.newNoteOnFrame', { n: frame.frame + 1 }) : $t('notes.newNote')" multiline capitalize="sentences" />
    <ChipGroup v-model="visibility" :label="$t('notes.whoCanRead')" :options="VISIBILITY" />
    <ChipGroup
      v-if="ends.length > 0"
      v-model="endId"
      :label="$t('notes.about')"
      :options="[{ value: '', label: $t('notes.wholeSession') }, ...ends.map((e) => ({ value: e.id, label: $t('notes.end', { n: e.index + 1 }) }))]"
    />
    <ChipGroup v-if="teams.length > 1" v-model="teamId" :label="$t('notes.team')" :options="teams.map((x) => ({ value: String(x.id), label: x.name }))" />
    <ErrorText :message="error" />
    <AppButton :busy="busy" @click="add">{{ $t('notes.add') }}</AppButton>
  </div>
</template>
