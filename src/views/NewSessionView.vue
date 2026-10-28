<script setup lang="ts">
import { IonSelect, IonSelectOption, IonToggle } from '@ionic/vue'
import AppPage from '@/components/AppPage.vue'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import AppButton from '@/components/AppButton.vue'
import ChipGroup from '@/components/ChipGroup.vue'
import ErrorText from '@/components/ErrorText.vue'
import FormField from '@/components/FormField.vue'
import GearPicker from '@/components/GearPicker.vue'
import { useLog } from '@/composables/useLog'
import { useNumberArrows } from '@/composables/useNumberArrows'
import { useUnits } from '@/composables/useUnits'
import { FACES } from '@/lib/faces'
import { defaultChoice, type Environment, firstEndDefaults, gearFor, type SessionType, sessionTypeKey, usesEnds } from '@/lib/log-model'

const { t } = useI18n()
const TYPES = computed<{ value: SessionType; label: string }[]>(() =>
  (['scoring', 'competition', 'volume', 'technique'] as const).map((value) => ({ value, label: t(sessionTypeKey(value)) })),
)
const ENVIRONMENTS = computed<{ value: Environment; label: string }[]>(() => [
  { value: 'indoor', label: t('newSession.indoor') },
  { value: 'outdoor', label: t('newSession.outdoor') },
  { value: '', label: t('newSession.notSet') },
])

const route = useRoute()
const router = useRouter()
// A coach logging for an archer without an account (?for=<id>&name=...): no equipment, it is the archer's.
const archer = route.query.for ? { id: Number(route.query.for), name: String(route.query.name ?? t('newSession.theArcher')) } : undefined
// A coach opening a session for the archer (?open=1): no type, no ends, no equipment; photos, videos and notes go into it.
// For an archer with an account (managed=0) the results stay the archer's.
const open = route.query.open === '1'
const managed = route.query.managed === '1'
const { startSession, sessions, equipment, refreshEquipment } = useLog()
const { numbering, setNumbering } = useNumberArrows()
const { distanceField, distanceUnit, parseDistance } = useUnits()
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
const distance = computed({ get: () => typed.value.distance ?? distanceField(defaults.value.distance_m), set: (v) => (typed.value.distance = v) })
const faceSlug = computed({ get: () => typed.value.face ?? defaults.value.face, set: (v) => (typed.value.face = v) })
const arrows = computed({ get: () => typed.value.arrows ?? String(defaults.value.arrows_per_end), set: (v) => (typed.value.arrows = v) })
const error = ref<string | null>(null)

function start() {
  if (open && archer) {
    const id = startSession('', environment.value, location.value.trim(), undefined, archer, { keep: true, noResults: !managed })
    return void router.replace(`/training/${id}`)
  }
  const metres = parseDistance(distance.value)
  const ends = usesEnds(type.value)
  if (ends && metres === null) return (error.value = t('newSession.enterDistance'))
  if (ends && !(Number(arrows.value) >= 1 && Number(arrows.value) <= 12)) return (error.value = t('newSession.arrowsRange'))
  const { bowId, arrowSetId } = choice.value
  const gear = archer || bowId === null ? undefined : gearFor(equipment.value, bowId, arrowSetId)
  const overview = `/training/${startSession(type.value, environment.value, location.value.trim(), gear, archer)}`
  void router.replace(overview)
  // Straight to the first end, with the overview behind it.
  if (ends) void router.push({ path: `${overview}/end`, query: { distance: String(metres), face: faceSlug.value, arrows: String(Math.round(Number(arrows.value))) } })
}
</script>

<template>
  <AppPage :title="open && archer ? $t('newSession.openTitle', { name: archer.name }) : archer ? $t('newSession.forTitle', { name: archer.name }) : $t('newSession.title')">
    <div class="screen">
      <ChipGroup v-if="!open" v-model="type" :label="$t('newSession.type')" :options="TYPES" />
      <ChipGroup v-model="environment" :label="$t('newSession.where')" :options="ENVIRONMENTS" />
      <FormField v-model="location" :label="$t('newSession.location')" capitalize="sentences" />
      <template v-if="!open && usesEnds(type)">
        <div class="row g-3">
          <div class="col-6"><FormField v-model="distance" :label="$t('newSession.distance', { unit: distanceUnit() })" inputmode="decimal" /></div>
          <div class="col-6"><FormField v-model="arrows" :label="$t('newSession.arrowsPerEnd')" inputmode="numeric" /></div>
        </div>
        <IonSelect v-model="faceSlug" :label="$t('newSession.face')" label-placement="stacked" fill="outline" interface="action-sheet">
          <IonSelectOption v-for="f in FACES" :key="f.slug" :value="f.slug">{{ f.name }}</IonSelectOption>
        </IonSelect>
        <IonToggle :checked="numbering" class="ion-text-wrap" @ion-change="setNumbering($event.detail.checked)">{{ $t('newSession.numberArrows') }}</IonToggle>
      </template>
      <GearPicker v-if="!archer && !open" :equipment="equipment" :bow-id="choice.bowId" :arrow-set-id="choice.arrowSetId" @change="(b, a) => (picked = { bowId: b, arrowSetId: a })" />
      <ErrorText :message="error" />
      <AppButton @click="start">{{ open ? $t('newSession.openStart') : $t('newSession.start') }}</AppButton>
    </div>
  </AppPage>
</template>
