<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { IonButton } from '@ionic/vue'
import { ref } from 'vue'

import AppButton from '@/components/AppButton.vue'
import ErrorText from '@/components/ErrorText.vue'
import FormField from '@/components/FormField.vue'
import { useLog } from '@/composables/useLog'
import { useUnits } from '@/composables/useUnits'
import type { LogSession } from '@/lib/log-model'
import { newId } from '@/lib/uuid'

const props = defineProps<{ session: LogSession }>()

const { t } = useI18n()
const { saveVolume, deleteVolume } = useLog()
const { distanceField, distanceUnit, formatDistance, parseDistance } = useUnits()
const last = props.session.volume[props.session.volume.length - 1]
const distance = ref(distanceField(last?.distance_m ?? '18'))
const count = ref('')
const error = ref<string | null>(null)

function add() {
  const metres = parseDistance(distance.value)
  const arrows = Number(count.value)
  if (metres === null) return (error.value = t('newSession.enterDistance'))
  if (!(Number.isInteger(arrows) && arrows >= 1 && arrows <= 32767)) return (error.value = t('volume.enterHow'))
  error.value = null
  saveVolume(props.session.id, { id: newId(), distance_m: metres.toFixed(1), arrow_count: arrows })
  count.value = ''
}
</script>

<template>
  <div class="row g-3">
    <div class="col-6"><FormField v-model="distance" :label="$t('newSession.distance', { unit: distanceUnit() })" inputmode="decimal" /></div>
    <div class="col-6"><FormField v-model="count" :label="$t('volume.arrows')" inputmode="numeric" @enter="add" /></div>
  </div>
  <ErrorText :message="error" />
  <AppButton @click="add">{{ $t('volume.add') }}</AppButton>
  <div v-for="entry in session.volume" :key="entry.id" class="d-flex justify-content-between">
    <span>{{ $t('volume.entry', { n: entry.arrow_count, d: formatDistance(entry.distance_m) }, entry.arrow_count) }}</span>
    <IonButton fill="clear" size="small" class="m-0" @click="deleteVolume(session.id, entry.id)">{{ $t('volume.remove') }}</IonButton>
  </div>
</template>
