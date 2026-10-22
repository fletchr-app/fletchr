<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import AppButton from '@/components/AppButton.vue'
import ChipGroup from '@/components/ChipGroup.vue'
import ErrorText from '@/components/ErrorText.vue'
import FormField from '@/components/FormField.vue'
import GearPicker from '@/components/GearPicker.vue'
import { useLog } from '@/composables/useLog'
import { FACES } from '@/lib/faces'
import { defaultChoice, type Environment, firstEndDefaults, gearFor, type SessionType, usesEnds } from '@/lib/log-model'

const TYPES: { value: SessionType; label: string }[] = [
  { value: 'scoring', label: 'Scoring' },
  { value: 'competition', label: 'Competition' },
  { value: 'volume', label: 'Volume' },
  { value: 'technique', label: 'Technique' },
]
const ENVIRONMENTS: { value: Environment; label: string }[] = [
  { value: 'indoor', label: 'Indoor' },
  { value: 'outdoor', label: 'Outdoor' },
  { value: '', label: 'Not set' },
]

const router = useRouter()
const { startSession, sessions, equipment, refreshEquipment } = useLog()
const type = ref<SessionType>('scoring')
const environment = ref<Environment>('indoor')
const location = ref('')
// Until you choose, the equipment you used last is selected.
const picked = ref<{ bowId: number | null; arrowSetId: number | null } | null>(null)
const choice = computed(() => picked.value ?? defaultChoice(equipment.value, sessions.value))

// Pick up equipment added since the last time: only works with a connection, otherwise the copy on the device is used.
onMounted(() => void refreshEquipment())

// Settings of the first end. Until you change one, it follows indoor/outdoor.
const typed = ref<{ distance?: string; face?: string; arrows?: string }>({})
const defaults = computed(() => firstEndDefaults(environment.value))
const distance = computed({ get: () => typed.value.distance ?? defaults.value.distance_m, set: (v) => (typed.value.distance = v) })
const faceSlug = computed({ get: () => typed.value.face ?? defaults.value.face, set: (v) => (typed.value.face = v) })
const arrows = computed({ get: () => typed.value.arrows ?? String(defaults.value.arrows_per_end), set: (v) => (typed.value.arrows = v) })
const error = ref<string | null>(null)

function start() {
  const metres = Number(distance.value.replace(',', '.'))
  const ends = usesEnds(type.value)
  if (ends && !(metres > 0)) return (error.value = 'Enter the distance in metres')
  if (ends && !(Number(arrows.value) >= 1 && Number(arrows.value) <= 12)) return (error.value = 'Arrows per end must be between 1 and 12')
  const { bowId, arrowSetId } = choice.value
  const gear = bowId === null ? undefined : gearFor(equipment.value, bowId, arrowSetId)
  const overview = `/training/${startSession(type.value, environment.value, location.value.trim(), gear)}`
  void router.replace(overview)
  // Straight to the first end, with the overview behind it.
  if (ends) void router.push({ path: `${overview}/end`, query: { distance: String(metres), face: faceSlug.value, arrows: String(Math.round(Number(arrows.value))) } })
}
</script>

<template>
  <div class="screen">
    <ChipGroup v-model="type" label="Type" :options="TYPES" />
    <ChipGroup v-model="environment" label="Where" :options="ENVIRONMENTS" />
    <FormField v-model="location" label="Location (optional)" capitalize="sentences" />
    <template v-if="usesEnds(type)">
      <div class="row g-3">
        <div class="col-6"><FormField v-model="distance" label="Distance (m)" inputmode="decimal" /></div>
        <div class="col-6"><FormField v-model="arrows" label="Arrows per end" inputmode="numeric" /></div>
      </div>
      <div>
        <label for="face" class="form-label fw-semibold mb-1">Face</label>
        <select id="face" v-model="faceSlug" class="form-select">
          <option v-for="f in FACES" :key="f.slug" :value="f.slug">{{ f.name }}</option>
        </select>
      </div>
    </template>
    <GearPicker :equipment="equipment" :bow-id="choice.bowId" :arrow-set-id="choice.arrowSetId" @change="(b, a) => (picked = { bowId: b, arrowSetId: a })" />
    <ErrorText :message="error" />
    <AppButton @click="start">Start</AppButton>
  </div>
</template>
