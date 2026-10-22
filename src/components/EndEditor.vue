<script setup lang="ts">
import { IonIcon, IonSegment, IonSegmentButton } from '@ionic/vue'
import { backspaceOutline, trashOutline } from 'ionicons/icons'
import { computed, ref } from 'vue'

import AppButton from '@/components/AppButton.vue'
import ErrorText from '@/components/ErrorText.vue'
import TargetPlot from '@/components/TargetPlot.vue'
import { useLog } from '@/composables/useLog'
import { FACES, getFace } from '@/lib/faces'
import { endTotal, keypadFor, type LogEnd, type LogSession, type LogShot, nextEndDefaults, shotLabel } from '@/lib/log-model'
import { newId } from '@/lib/uuid'

// One end: place the arrows on the face (or type the scores) and confirm. Distance, face and arrow
// count come from the setup screen. Uploads as soon as it is confirmed. Fills the height its parent
// gives it and never scrolls, so touching the face cannot move the page.
const props = defineProps<{ session: LogSession; editing: LogEnd | null; distance: string; face: string; arrows: number }>()
const emit = defineEmits<{ done: [] }>()

const { saveEnd, deleteEnd } = useLog()

const start = props.editing ?? { index: nextEndDefaults(props.session).index, id: newId() }
// Arrows from another face do not carry over.
const shots = ref<LogShot[]>(props.editing && props.editing.face === props.face ? props.editing.shots : [])
const mode = ref<'plot' | 'pad'>('plot')
const selectedId = ref<string | null>(null)
const error = ref<string | null>(null)

const face = computed(() => getFace(props.face) ?? FACES[0]!)
const full = computed(() => shots.value.length >= props.arrows)
const keypad = computed(() => keypadFor(face.value))
const total = computed(() => endTotal({ ...start, distance_m: props.distance, face: face.value.slug, arrows_per_end: props.arrows, shots: shots.value }))

function save() {
  if (shots.value.length === 0) return (error.value = 'Enter at least one arrow')
  saveEnd(props.session.id, {
    id: start.id,
    index: start.index,
    distance_m: Number(props.distance).toFixed(1),
    face: face.value.slug,
    arrows_per_end: props.arrows,
    shots: shots.value,
  })
  emit('done')
}

function deleteSelected() {
  shots.value = shots.value.filter((s) => s.id !== selectedId.value)
  selectedId.value = null
}

function remove() {
  deleteEnd(props.session.id, start.id)
  emit('done')
}
</script>

<template>
  <div class="entry">
    <div class="d-flex align-items-center gap-2">
      <div class="flex-grow-1 text-truncate">
        <span class="fw-semibold">End {{ start.index + 1 }}</span>
        <span class="muted"> · {{ distance }} m · {{ face.name }}</span>
      </div>
      <IonSegment v-model="mode" style="width: 160px; flex: none" aria-label="Enter arrows by">
        <IonSegmentButton value="plot">Touch</IonSegmentButton>
        <IonSegmentButton value="pad">Type</IonSegmentButton>
      </IonSegment>
    </div>

    <div class="d-flex flex-wrap gap-2 align-items-center">
      <button
        v-for="i in arrows"
        :key="i"
        type="button"
        class="key"
        :class="{ selected: shots[i - 1] && shots[i - 1]!.id === selectedId }"
        style="width: 44px; height: 44px"
        :disabled="!shots[i - 1]"
        @click="selectedId = shots[i - 1]!.id === selectedId ? null : shots[i - 1]!.id"
      >
        {{ shots[i - 1] ? shotLabel(shots[i - 1]!) : '' }}
      </button>
      <span class="fs-5 ms-1">= {{ total }}</span>
      <button
        v-if="selectedId !== null && shots.some((s) => s.id === selectedId)"
        type="button"
        class="key outline ms-auto"
        style="width: 44px; height: 44px"
        aria-label="Delete the selected arrow"
        @click="deleteSelected"
      >
        <IonIcon :icon="trashOutline" />
      </button>
    </div>

    <TargetPlot v-if="mode === 'plot'" :face="face" :shots="shots" :max="arrows" :selected-id="selectedId" @change="shots = $event" />
    <div v-else class="d-flex flex-wrap gap-2 align-content-start" style="flex: 1 1 0; min-height: 0">
      <div v-if="keypad.length === 0" class="muted">This face has no scores to type. Place the arrows on it instead.</div>
      <button
        v-for="key in keypad"
        :key="key.label"
        type="button"
        class="key"
        style="width: 56px; height: 56px"
        :disabled="full"
        @click="shots = [...shots, { id: newId(), value: key.value, is_x: key.is_x, is_miss: key.is_miss }]"
      >
        {{ key.label }}
      </button>
      <button type="button" class="key outline" style="width: 56px; height: 56px" aria-label="Remove the last arrow" @click="shots = shots.slice(0, -1)">
        <IonIcon :icon="backspaceOutline" />
      </button>
    </div>

    <ErrorText :message="error" />
    <div class="d-flex gap-2">
      <template v-if="editing">
        <AppButton secondary @click="emit('done')">Cancel</AppButton>
        <AppButton secondary @click="remove">Delete</AppButton>
      </template>
      <AppButton @click="save">{{ editing ? 'Save end' : 'Confirm end' }}</AppButton>
    </div>
  </div>
</template>
