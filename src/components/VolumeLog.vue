<script setup lang="ts">
import { ref } from 'vue'

import AppButton from '@/components/AppButton.vue'
import ErrorText from '@/components/ErrorText.vue'
import FormField from '@/components/FormField.vue'
import { useLog } from '@/composables/useLog'
import type { LogSession } from '@/lib/log-model'
import { newId } from '@/lib/uuid'

const props = defineProps<{ session: LogSession }>()

const { saveVolume, deleteVolume } = useLog()
const last = props.session.volume[props.session.volume.length - 1]
const distance = ref(last?.distance_m ?? '18')
const count = ref('')
const error = ref<string | null>(null)

function add() {
  const metres = Number(distance.value.replace(',', '.'))
  const arrows = Number(count.value)
  if (!(metres > 0)) return (error.value = 'Enter the distance in metres')
  if (!(Number.isInteger(arrows) && arrows >= 1 && arrows <= 32767)) return (error.value = 'Enter how many arrows you shot')
  error.value = null
  saveVolume(props.session.id, { id: newId(), distance_m: metres.toFixed(1), arrow_count: arrows })
  count.value = ''
}
</script>

<template>
  <div class="row g-3">
    <div class="col-6"><FormField v-model="distance" label="Distance (m)" inputmode="decimal" /></div>
    <div class="col-6"><FormField v-model="count" label="Arrows" inputmode="numeric" @enter="add" /></div>
  </div>
  <ErrorText :message="error" />
  <AppButton @click="add">Add</AppButton>
  <div v-for="entry in session.volume" :key="entry.id" class="d-flex justify-content-between">
    <span>{{ entry.arrow_count }} arrows at {{ entry.distance_m }} m</span>
    <a href="#" @click.prevent="deleteVolume(session.id, entry.id)">Remove</a>
  </div>
</template>
