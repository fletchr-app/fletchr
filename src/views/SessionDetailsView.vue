<script setup lang="ts">
import { IonChip } from '@ionic/vue'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import AppButton from '@/components/AppButton.vue'
import AppPage from '@/components/AppPage.vue'
import FormField from '@/components/FormField.vue'
import RatingChips from '@/components/RatingChips.vue'
import { useLog } from '@/composables/useLog'
import { type SessionDetails } from '@/lib/log-model'
import { decodeWeather, encodeWeather, WEATHER_TOKENS, type WeatherToken } from '@/lib/weather'

// The archer's notes on a session: weather, how they felt (1 to 5), goals and notes. Any time, during or after the session.
const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const { loaded, sessions, setDetails } = useLog()

const sessionId = route.params.id as string
const session = computed(() => sessions.value.find((s) => s.id === sessionId))

const start = session.value?.details
const weather = decodeWeather(start?.weather ?? '')
const chips = ref<WeatherToken[]>(weather.tokens)
const weatherText = ref(weather.text)
const physical = ref<number | null>(start?.physical_rating ?? null)
const mental = ref<number | null>(start?.mental_rating ?? null)
const goals = ref(start?.goals ?? '')
const notes = ref(start?.notes ?? '')

// Several weather chips can be on at once.
const WEATHER_CHIPS = computed(() => WEATHER_TOKENS.map((w) => ({ value: w, label: t(`details.weatherWord.${w}`) })))
const toggle = (w: WeatherToken) => (chips.value = chips.value.includes(w) ? chips.value.filter((c) => c !== w) : [...chips.value, w])

function save() {
  const details: SessionDetails = {
    weather: encodeWeather({ tokens: chips.value, text: weatherText.value }),
    physical_rating: physical.value,
    mental_rating: mental.value,
    goals: goals.value.trim(),
    notes: notes.value.trim(),
  }
  setDetails(sessionId, details)
  router.back()
}
</script>

<template>
  <AppPage :title="$t('details.title')">
    <div v-if="!session" class="screen">{{ loaded ? $t('session.notOnDevice') : $t('common.loading') }}</div>
    <div v-else class="screen">
      <div>
        <div class="fw-semibold mb-1">{{ $t('details.weather') }}</div>
        <div class="d-flex flex-wrap gap-1">
          <IonChip v-for="w in WEATHER_CHIPS" :key="w.value" class="m-0 chip" :outline="!chips.includes(w.value)" :class="{ selected: chips.includes(w.value) }" @click="toggle(w.value)">
            {{ w.label }}
          </IonChip>
        </div>
      </div>
      <FormField v-model="weatherText" :label="$t('details.weatherText')" />
      <RatingChips v-model="physical" :label="$t('details.physical')" />
      <RatingChips v-model="mental" :label="$t('details.mental')" />
      <div class="faint">{{ $t('details.ratingHint') }}</div>
      <FormField v-model="goals" :label="$t('details.goals')" multiline capitalize="sentences" />
      <FormField v-model="notes" :label="$t('details.notes')" multiline capitalize="sentences" />
      <AppButton @click="save">{{ $t('common.save') }}</AppButton>
    </div>
  </AppPage>
</template>
