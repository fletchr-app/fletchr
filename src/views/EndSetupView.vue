<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import AppButton from '@/components/AppButton.vue'
import ErrorText from '@/components/ErrorText.vue'
import FormField from '@/components/FormField.vue'
import GearPicker from '@/components/GearPicker.vue'
import { useLog } from '@/composables/useLog'
import { FACES } from '@/lib/faces'
import { gearFor, nextEndDefaults } from '@/lib/log-model'

// Before each end: distance, face, arrows per end and equipment. "Start" opens the arrow entry.
// Shown before the first end of a session, and from the "change" link on the session page.
const route = useRoute()
const router = useRouter()
const { loaded, sessions, equipment, setGear } = useLog()

const session = computed(() => sessions.value.find((s) => s.id === route.params.id))
const start = session.value ? nextEndDefaults(session.value) : null

const distance = ref(start?.distance_m ?? '')
const faceSlug = ref(start?.face ?? FACES[0]!.slug)
const arrows = ref(String(start?.arrows_per_end ?? 3))
const error = ref<string | null>(null)

function begin() {
  const metres = Number(distance.value.replace(',', '.'))
  if (!(metres > 0)) return (error.value = 'Enter the distance in metres')
  if (!(Number(arrows.value) >= 1 && Number(arrows.value) <= 12)) return (error.value = 'Arrows per end must be between 1 and 12')
  const query: Record<string, string> = { distance: String(metres), face: faceSlug.value, arrows: String(Math.round(Number(arrows.value))) }
  void router.replace({ path: `/training/${route.params.id}/end`, query })
}
</script>

<template>
  <div v-if="!session" class="screen">{{ loaded ? 'This session is not on this device.' : 'Loading…' }}</div>
  <div v-else class="screen">
    <h2 class="h5 m-0">{{ `End ${(start?.index ?? 0) + 1}` }}</h2>
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
    <GearPicker
      :equipment="equipment"
      :bow-id="session.gear?.bow_id ?? null"
      :arrow-set-id="session.gear?.arrow_set_id ?? null"
      @change="(bowId, arrowSetId) => setGear(session!.id, gearFor(equipment, bowId, arrowSetId))"
    />
    <div class="faint">
      Next screen: touch the face and move to the exact spot, then lift to place the arrow. Touch an arrow to move it. An arrow touching a
      line counts for the higher ring: move it over the line.
    </div>
    <ErrorText :message="error" />
    <AppButton @click="begin">Start entering arrows</AppButton>
  </div>
</template>
