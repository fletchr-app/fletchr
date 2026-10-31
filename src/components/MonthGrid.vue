<script setup lang="ts">
import { IonButton, IonIcon } from '@ionic/vue'
import { chevronBack, chevronForward } from 'ionicons/icons'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

// A month as a grid of days with dots for what is on (up to three; cancelled ones hollow). Tapping a day selects it; the arrows
// change the month. The days come from `monthGrid`, so they are whole weeks and the neighbouring months are dimmed.
const props = defineProps<{
  month: string
  days: string[]
  dots: Map<string, { count: number; cancelled: number }>
  selected: string
  today: string
}>()
const emit = defineEmits<{ select: [day: string]; shift: [step: -1 | 1]; today: [] }>()

const { locale } = useI18n()
const at = (day: string) => new Date(`${day}T12:00`)
const title = computed(() => at(`${props.month}-01`).toLocaleDateString(locale.value, { month: 'long', year: 'numeric' }))
const weekdays = computed(() => props.days.slice(0, 7).map((day) => at(day).toLocaleDateString(locale.value, { weekday: 'short' })))
const label = (day: string) => at(day).toLocaleDateString(locale.value, { weekday: 'long', day: 'numeric', month: 'long' })
const dotsOf = (day: string) => {
  const dot = props.dots.get(day)
  if (!dot) return []
  const filled = Array.from({ length: dot.count }, () => false)
  const hollow = Array.from({ length: dot.cancelled }, () => true)
  return [...filled, ...hollow].slice(0, 3)
}
</script>

<template>
  <div class="month">
    <div class="d-flex align-items-center">
      <IonButton fill="clear" :aria-label="$t('schedule.previousMonth')" @click="emit('shift', -1)"><IonIcon slot="icon-only" :icon="chevronBack" /></IonButton>
      <div class="flex-grow-1 text-center fw-semibold">{{ title }}</div>
      <IonButton fill="clear" :aria-label="$t('schedule.nextMonth')" @click="emit('shift', 1)"><IonIcon slot="icon-only" :icon="chevronForward" /></IonButton>
      <IonButton fill="clear" size="small" @click="emit('today')">{{ $t('schedule.today') }}</IonButton>
    </div>
    <div class="grid">
      <div v-for="(name, i) in weekdays" :key="i" class="weekday">{{ name }}</div>
      <button
        v-for="day in days"
        :key="day"
        type="button"
        class="cell"
        :class="{ outside: !day.startsWith(month), selected: day === selected, today: day === today }"
        :aria-label="label(day)"
        :aria-pressed="day === selected"
        @click="emit('select', day)"
      >
        <span>{{ Number(day.slice(8)) }}</span>
        <span class="dots"><i v-for="(hollow, i) in dotsOf(day)" :key="i" :class="{ hollow }" /></span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 2px;
}
.weekday {
  text-align: center;
  font-size: 0.75rem;
  opacity: 0.7;
  padding: 0.25rem 0;
}
.cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  min-height: 3rem;
  padding: 0.25rem 0;
  border: 1px solid transparent;
  border-radius: 8px;
  background: none;
  color: inherit;
  font: inherit;
}
.cell.outside {
  opacity: 0.4;
}
.cell.today {
  border-color: var(--ion-color-primary);
}
.cell.selected {
  background: var(--ion-color-primary);
  color: var(--ion-color-primary-contrast);
}
.dots {
  display: flex;
  gap: 3px;
  height: 6px;
}
.dots i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}
.dots i.hollow {
  background: none;
  box-shadow: inset 0 0 0 1px currentColor;
}
</style>
