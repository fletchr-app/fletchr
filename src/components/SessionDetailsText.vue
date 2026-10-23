<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import type { SessionDetails } from '@/lib/log-model'
import { describeWeather } from '@/lib/weather'

// What the archer wrote about a session, as short lines. Nothing is shown for what is empty.
const props = defineProps<{ details?: SessionDetails }>()
const { t } = useI18n()

const weather = computed(() => (props.details ? describeWeather(props.details.weather, (w) => t(`details.weatherWord.${w}`)) : ''))
const ratings = computed(() => {
  const d = props.details
  if (!d || (d.physical_rating === null && d.mental_rating === null)) return ''
  return t('details.shownRatings', { physical: d.physical_rating ?? '–', mental: d.mental_rating ?? '–' })
})
</script>

<template>
  <div v-if="details" class="d-flex flex-column gap-1">
    <div v-if="weather">{{ $t('details.shownWeather', { weather }) }}</div>
    <div v-if="ratings">{{ ratings }}</div>
    <div v-if="details.goals" class="pre">{{ $t('details.shownGoals', { goals: details.goals }) }}</div>
    <div v-if="details.notes" class="pre">{{ $t('details.shownNotes', { notes: details.notes }) }}</div>
  </div>
</template>

<style scoped>
.pre {
  white-space: pre-wrap;
}
</style>
