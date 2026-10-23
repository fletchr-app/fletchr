<script setup lang="ts">
import { IonIcon, IonSegment, IonSegmentButton } from '@ionic/vue'
import { backspaceOutline, trashOutline } from 'ionicons/icons'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import AppButton from '@/components/AppButton.vue'
import ErrorText from '@/components/ErrorText.vue'
import TargetPlot from '@/components/TargetPlot.vue'
import { useLog } from '@/composables/useLog'
import { useNumberArrows } from '@/composables/useNumberArrows'
import { useUnits } from '@/composables/useUnits'
import { lastNumberBefore, nextNumber, setSize } from '@/lib/arrow-numbers'
import { FACES, getFace } from '@/lib/faces'
import { endTotal, keypadFor, type LogEnd, type LogSession, type LogShot, nextEndDefaults, shotLabel } from '@/lib/log-model'
import { newId } from '@/lib/uuid'

// One end: place the arrows on the face (or type the scores) and confirm. Distance, face and arrow
// count come from the setup screen. Uploads as soon as it is confirmed. Fills the height its parent
// gives it and never scrolls, so touching the face cannot move the page.
const props = defineProps<{ session: LogSession; editing: LogEnd | null; distance: string; face: string; arrows: number }>()
const emit = defineEmits<{ done: [] }>()

const { t } = useI18n()
const { saveEnd, deleteEnd, equipment } = useLog()
const { numbering } = useNumberArrows()
const { formatDistance } = useUnits()

const start = props.editing ?? { index: nextEndDefaults(props.session).index, id: newId() }
// Arrows from another face do not carry over.
const shots = ref<LogShot[]>(props.editing && props.editing.face === props.face ? props.editing.shots : [])
const mode = ref<'plot' | 'pad'>('plot')
const selectedId = ref<string | null>(null)
const error = ref<string | null>(null)

const face = computed(() => getFace(props.face) ?? FACES[0]!)
const full = computed(() => shots.value.length >= props.arrows)

// Numbered arrows: the next number is suggested (carrying on from the earlier ends, skipping the ones used in this end).
// Tapping a number picks it for the next arrow; with an arrow selected it sets that arrow's number instead.
const size = computed(() => setSize(props.session, equipment.value))
const numberBefore = lastNumberBefore(props.session, start.index)
const chosen = ref<number | null>(null)
const usedNumbers = computed(() => shots.value.flatMap((s) => s.arrow_number ?? []))
const lastInEnd = computed(() => [...shots.value].reverse().find((s) => s.arrow_number != null)?.arrow_number ?? null)
const nextArrowNumber = computed(() => (numbering.value ? (chosen.value ?? nextNumber(size.value, usedNumbers.value, lastInEnd.value ?? numberBefore)) : null))
const selectedShot = computed(() => shots.value.find((s) => s.id === selectedId.value))
const highlighted = computed(() => (selectedShot.value ? (selectedShot.value.arrow_number ?? null) : nextArrowNumber.value))

function withNumber(shot: LogShot, n: number | undefined): LogShot {
  const { arrow_number: _old, ...rest } = shot
  return n === undefined ? rest : { ...rest, arrow_number: n }
}
function pickNumber(n: number) {
  const target = selectedShot.value
  if (!target) return void (chosen.value = chosen.value === n ? null : n)
  const same = target.arrow_number === n
  // An end cannot hold the same arrow twice: the number moves to this arrow.
  shots.value = shots.value.map((s) => (s.id === target.id ? withNumber(s, same ? undefined : n) : !same && s.arrow_number === n ? withNumber(s, undefined) : s))
}
function plotted(next: LogShot[]) {
  if (next.length > shots.value.length) chosen.value = null
  shots.value = next
}
function typed(key: { value: number | null; is_x: boolean; is_miss: boolean }) {
  const number = nextArrowNumber.value
  shots.value = [...shots.value, { id: newId(), value: key.value, is_x: key.is_x, is_miss: key.is_miss, ...(number != null ? { arrow_number: number } : {}) }]
  chosen.value = null
}
const keypad = computed(() => keypadFor(face.value))
const total = computed(() => endTotal({ ...start, distance_m: props.distance, face: face.value.slug, arrows_per_end: props.arrows, shots: shots.value }))

function save() {
  if (shots.value.length === 0) return (error.value = t('end.enterOne'))
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
        <span class="fw-semibold">{{ $t('end.number', { n: start.index + 1 }) }}</span>
        <span class="muted"> · {{ formatDistance(distance) }} · {{ face.name }}</span>
      </div>
      <IonSegment v-model="mode" style="width: 160px; flex: none" :aria-label="$t('end.enterBy')">
        <IonSegmentButton value="plot">{{ $t('end.touch') }}</IonSegmentButton>
        <IonSegmentButton value="pad">{{ $t('end.type') }}</IonSegmentButton>
      </IonSegment>
    </div>

    <div class="d-flex flex-wrap gap-2 align-items-center">
      <button
        v-for="i in arrows"
        :key="i"
        type="button"
        class="key"
        :class="{ selected: shots[i - 1] && shots[i - 1]!.id === selectedId }"
        style="width: 44px; height: 44px; position: relative"
        :disabled="!shots[i - 1]"
        @click="selectedId = shots[i - 1]!.id === selectedId ? null : shots[i - 1]!.id"
      >
        {{ shots[i - 1] ? shotLabel(shots[i - 1]!) : '' }}
        <span v-if="numbering && shots[i - 1]?.arrow_number != null" class="arrow-no">{{ shots[i - 1]!.arrow_number }}</span>
      </button>
      <span class="fs-5 ms-1">= {{ total }}</span>
      <button
        v-if="selectedId !== null && shots.some((s) => s.id === selectedId)"
        type="button"
        class="key outline ms-auto"
        style="width: 44px; height: 44px"
        :aria-label="$t('end.deleteSelected')"
        @click="deleteSelected"
      >
        <IonIcon :icon="trashOutline" />
      </button>
    </div>

    <div v-if="numbering" class="d-flex flex-wrap gap-1">
      <button
        v-for="n in size"
        :key="n"
        type="button"
        class="key number-key"
        :class="{ selected: n === highlighted, used: usedNumbers.includes(n) && n !== highlighted }"
        :aria-label="$t('end.arrowNumber', { n })"
        @click="pickNumber(n)"
      >
        {{ n }}
      </button>
    </div>

    <TargetPlot v-if="mode === 'plot'" :face="face" :shots="shots" :max="arrows" :selected-id="selectedId" :number-next="nextArrowNumber" @change="plotted" />
    <div v-else class="d-flex flex-wrap gap-2 align-content-start" style="flex: 1 1 0; min-height: 0">
      <div v-if="keypad.length === 0" class="muted">{{ $t('end.noKeys') }}</div>
      <button
        v-for="key in keypad"
        :key="key.label"
        type="button"
        class="key"
        style="width: 56px; height: 56px"
        :disabled="full"
        @click="typed(key)"
      >
        {{ key.label }}
      </button>
      <button type="button" class="key outline" style="width: 56px; height: 56px" :aria-label="$t('end.removeLast')" @click="shots = shots.slice(0, -1)">
        <IonIcon :icon="backspaceOutline" />
      </button>
    </div>

    <ErrorText :message="error" />
    <div class="d-flex gap-2">
      <template v-if="editing">
        <AppButton secondary @click="emit('done')">{{ $t('common.cancel') }}</AppButton>
        <AppButton secondary @click="remove">{{ $t('common.delete') }}</AppButton>
      </template>
      <AppButton @click="save">{{ editing ? $t('end.saveEnd') : $t('end.confirm') }}</AppButton>
    </div>
  </div>
</template>

<style scoped>
.arrow-no {
  position: absolute;
  top: 1px;
  right: 3px;
  font-size: 0.65rem;
  font-weight: 700;
  opacity: 0.75;
}
.number-key {
  width: 30px;
  height: 30px;
  font-size: 0.9rem;
}
.number-key.used {
  opacity: 0.4;
}
</style>
