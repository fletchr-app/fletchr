<script setup lang="ts">
import { computed, ref } from 'vue'

import AppButton from '@/components/AppButton.vue'
import ChipGroup from '@/components/ChipGroup.vue'
import ErrorText from '@/components/ErrorText.vue'
import FormField from '@/components/FormField.vue'
import TargetPlot from '@/components/TargetPlot.vue'
import { useLog } from '@/composables/useLog'
import { FACES, getFace } from '@/lib/faces'
import { endTotal, keypadFor, type LogEnd, type LogSession, type LogShot, nextEndDefaults, shotLabel } from '@/lib/log-model'
import { newId } from '@/lib/uuid'

// One end: set distance, face and arrow count, place the arrows on the face (or type the scores),
// confirm. Uploads as soon as it is confirmed.
const props = defineProps<{ session: LogSession; editing: LogEnd | null }>()
const emit = defineEmits<{ done: [] }>()

const { saveEnd, deleteEnd } = useLog()

const start = props.editing ?? { ...nextEndDefaults(props.session), id: newId(), shots: [] as LogShot[] }
const distance = ref(start.distance_m)
const faceSlug = ref(start.face)
const arrows = ref(String(start.arrows_per_end))
const shots = ref<LogShot[]>(start.shots)
const pickingFace = ref(false)
const mode = ref<'plot' | 'pad'>('plot')
const selectedId = ref<string | null>(null)
const error = ref<string | null>(null)

const face = computed(() => getFace(faceSlug.value) ?? FACES[0]!)
const arrowCount = computed(() => Math.max(1, Math.min(12, Math.round(Number(arrows.value)) || 1)))
const full = computed(() => shots.value.length >= arrowCount.value)
const keypad = computed(() => keypadFor(face.value))
const total = computed(() => endTotal({ ...start, shots: shots.value }))

function save() {
  const metres = Number(distance.value.replace(',', '.'))
  if (!(metres > 0)) return (error.value = 'Enter the distance in metres')
  if (!(Number(arrows.value) >= 1 && Number(arrows.value) <= 12)) return (error.value = 'Arrows per end must be between 1 and 12')
  if (shots.value.length === 0) return (error.value = 'Enter at least one arrow')
  if (shots.value.length > arrowCount.value) return (error.value = 'More arrows entered than arrows per end')
  saveEnd(props.session.id, {
    id: start.id,
    index: start.index,
    distance_m: metres.toFixed(1),
    face: face.value.slug,
    arrows_per_end: arrowCount.value,
    shots: shots.value,
  })
  emit('done')
}

function chooseFace(slug: string) {
  if (slug !== face.value.slug) {
    shots.value = [] // arrows from another face do not carry over
    selectedId.value = null
  }
  faceSlug.value = slug
  pickingFace.value = false
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
  <div class="d-flex flex-column gap-3">
    <h2 class="h5 m-0">{{ editing ? `Edit end ${start.index + 1}` : `End ${start.index + 1}` }}</h2>
    <div class="row g-3">
      <div class="col-6"><FormField v-model="distance" label="Distance (m)" inputmode="decimal" /></div>
      <div class="col-6"><FormField v-model="arrows" label="Arrows per end" inputmode="numeric" /></div>
    </div>
    <button type="button" class="btn btn-link text-start p-0" @click="pickingFace = !pickingFace">
      Face: {{ face.name }} {{ pickingFace ? '▴' : '▾' }}
    </button>
    <template v-if="pickingFace">
      <button
        v-for="f in FACES"
        :key="f.slug"
        type="button"
        class="btn btn-link text-start py-1 px-0 text-reset"
        :class="f.slug === face.slug ? 'fw-bold' : ''"
        @click="chooseFace(f.slug)"
      >
        {{ f.name }}
      </button>
    </template>

    <ChipGroup
      v-model="mode"
      label="Enter arrows by"
      :options="[
        { value: 'plot', label: 'Touching the face' },
        { value: 'pad', label: 'Typing the score' },
      ]"
    />

    <div class="d-flex flex-wrap gap-2 align-items-center">
      <button
        v-for="i in arrowCount"
        :key="i"
        type="button"
        class="btn d-flex align-items-center justify-content-center p-0 fs-5 fw-semibold"
        :class="shots[i - 1] && shots[i - 1]!.id === selectedId ? 'border-3' : ''"
        :style="{ width: '44px', height: '44px', borderColor: shots[i - 1] && shots[i - 1]!.id === selectedId ? '#ff00ff' : undefined }"
        :disabled="!shots[i - 1]"
        @click="selectedId = shots[i - 1]!.id === selectedId ? null : shots[i - 1]!.id"
      >
        {{ shots[i - 1] ? shotLabel(shots[i - 1]!) : '' }}
      </button>
      <span class="fs-5 ms-2">= {{ total }}</span>
    </div>
    <AppButton v-if="selectedId !== null && shots.some((s) => s.id === selectedId)" secondary @click="deleteSelected">
      Delete the selected arrow
    </AppButton>

    <template v-if="mode === 'plot'">
      <TargetPlot :face="face" :shots="shots" :max="arrowCount" :selected-id="selectedId" @change="shots = $event" />
      <div class="faint">
        Touch the face and move to the exact spot, then lift to place the arrow. Touch an arrow to move it. An arrow touching a line
        counts for the higher ring: move it over the line.
      </div>
    </template>
    <div v-else class="d-flex flex-wrap gap-2">
      <div v-if="keypad.length === 0" class="muted">This face has no scores to type. Place the arrows on it instead.</div>
      <button
        v-for="key in keypad"
        :key="key.label"
        type="button"
        class="btn btn-secondary fs-5 fw-semibold p-0"
        style="width: 56px; height: 56px"
        :disabled="full"
        @click="shots = [...shots, { id: newId(), value: key.value, is_x: key.is_x, is_miss: key.is_miss }]"
      >
        {{ key.label }}
      </button>
      <button type="button" class="btn btn-outline-secondary fs-5 p-0" style="width: 56px; height: 56px" aria-label="Remove the last arrow" @click="shots = shots.slice(0, -1)">
        <i class="bi bi-backspace"></i>
      </button>
    </div>

    <ErrorText :message="error" />
    <AppButton @click="save">{{ editing ? 'Save end' : 'Confirm end' }}</AppButton>
    <template v-if="editing">
      <AppButton secondary @click="emit('done')">Cancel</AppButton>
      <AppButton secondary @click="remove">Delete end</AppButton>
    </template>
  </div>
</template>
