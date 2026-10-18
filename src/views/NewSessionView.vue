<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import AppButton from '@/components/AppButton.vue'
import ChipGroup from '@/components/ChipGroup.vue'
import FormField from '@/components/FormField.vue'
import GearPicker from '@/components/GearPicker.vue'
import { useLog } from '@/composables/useLog'
import { defaultChoice, type Environment, gearFor, type SessionType } from '@/lib/log-model'

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

function start() {
  const { bowId, arrowSetId } = choice.value
  const gear = bowId === null ? undefined : gearFor(equipment.value, bowId, arrowSetId)
  void router.replace(`/training/${startSession(type.value, environment.value, location.value.trim(), gear)}`)
}
</script>

<template>
  <div class="screen">
    <ChipGroup v-model="type" label="Type" :options="TYPES" />
    <ChipGroup v-model="environment" label="Where" :options="ENVIRONMENTS" />
    <FormField v-model="location" label="Location (optional)" capitalize="sentences" />
    <GearPicker :equipment="equipment" :bow-id="choice.bowId" :arrow-set-id="choice.arrowSetId" @change="(b, a) => (picked = { bowId: b, arrowSetId: a })" />
    <AppButton @click="start">Start</AppButton>
  </div>
</template>
