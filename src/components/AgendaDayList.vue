<script setup lang="ts">
import { IonItem, IonLabel, IonList } from '@ionic/vue'
import { computed, toRef } from 'vue'
import { useI18n } from 'vue-i18n'

import AppButton from '@/components/AppButton.vue'
import ChipGroup from '@/components/ChipGroup.vue'
import ErrorText from '@/components/ErrorText.vue'
import FormField from '@/components/FormField.vue'
import { useAgendaActions } from '@/composables/useAgendaActions'
import { dayPart, daysOf } from '@/lib/calendar'
import { type AgendaItem, eventTitle } from '@/lib/schedule'

// The trainings of some days, one list per day. Tapping one opens its actions below it; `canPlan` tells whether the viewer may
// change it (cancel, move, add notes for an archer), everybody else can only open it.
const props = defineProps<{
  days: { day: string; items: AgendaItem[] }[]
  canPlan: (item: AgendaItem) => boolean
  members: readonly { user_id: number; name: string }[] | null
}>()
const emit = defineEmits<{ changed: [] }>()

const { t, locale } = useI18n()
const { selected, mode, error, archer, start, end, location, select, startMove, change, move, open, addMedia } = useAgendaActions(
  toRef(props, 'members'),
  () => emit('changed'),
)
const archers = computed(() => (props.members ?? []).map((m) => ({ value: String(m.user_id), label: m.name })))

const title = (item: AgendaItem) => {
  const name = eventTitle(item)
  return name.startsWith('event.kind.') ? t(name) : name
}
const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
// A camp over several days shows its start on its first day, "all day" in between and its end on the last day; the days before its
// end say when it ends.
const times = (item: AgendaItem, day: string) => {
  const part = dayPart(item, day)
  if (part === 'from') return t('schedule.fromTime', { time: clock(item.start) })
  if (part === 'to') return t('schedule.toTime', { time: clock(item.end) })
  return part === 'whole' ? t('schedule.allDay') : `${clock(item.start)}–${clock(item.end)}`
}
const until = (item: AgendaItem, day: string) => {
  const last = daysOf(item).at(-1)!
  if (day === last || last === daysOf(item)[0]) return ''
  const date = new Date(`${last}T12:00`).toLocaleDateString(locale.value, { day: 'numeric', month: 'short' })
  return dayPart(item, last) === 'whole' ? t('schedule.endsOn', { date }) : t('schedule.endsOnAt', { date, time: clock(item.end) })
}
const dayTitle = (day: string) => new Date(`${day}T12:00`).toLocaleDateString(locale.value, { weekday: 'long', day: 'numeric', month: 'long' })
</script>

<template>
  <template v-for="d in days" :key="d.day">
    <h3 class="day">{{ dayTitle(d.day) }}</h3>
    <IonList inset>
      <template v-for="item in d.items" :key="item.id">
        <IonItem button detail lines="full" @click="select(item)">
          <IonLabel class="ion-text-wrap">
            <h3 :class="{ 'text-decoration-line-through': item.cancelled }">{{ times(item, d.day) }} · {{ title(item) }}</h3>
            <p>{{ [item.cancelled ? $t('schedule.cancelled') : '', until(item, d.day), item.location].filter(Boolean).join(' · ') }}</p>
          </IonLabel>
        </IonItem>
        <div v-if="selected?.id === item.id" class="d-flex flex-column gap-2 p-3">
          <template v-if="mode === 'move'">
            <FormField v-model="start" type="datetime-local" :label="$t('schedule.start')" />
            <FormField v-model="end" type="datetime-local" :label="$t('schedule.end')" />
            <FormField v-model="location" :label="$t('schedule.location')" capitalize="sentences" />
            <AppButton @click="move(item)">{{ $t('common.save') }}</AppButton>
            <AppButton secondary @click="mode = ''">{{ $t('common.cancel') }}</AppButton>
          </template>
          <template v-else>
            <template v-if="canPlan(item)">
              <ChipGroup v-if="archers.length" v-model="archer" :label="$t('schedule.forArcher')" :options="archers" />
              <AppButton v-if="archer && !item.cancelled" @click="open(item, (id) => `/events/${id}?archer=${archer}`)">{{ $t('schedule.addNote') }}</AppButton>
              <AppButton v-if="archer && !item.cancelled" secondary @click="addMedia(item)">{{ $t('schedule.addMedia') }}</AppButton>
            </template>
            <AppButton secondary @click="open(item, (id) => `/events/${id}`)">{{ $t('schedule.openEvent') }}</AppButton>
            <AppButton v-if="canPlan(item)" secondary @click="startMove(item)">{{ $t('schedule.move') }}</AppButton>
            <AppButton v-if="canPlan(item)" secondary @click="change(item, { cancelled: !item.cancelled })">{{ item.cancelled ? $t('schedule.reinstate') : $t('schedule.cancel') }}</AppButton>
          </template>
          <ErrorText :message="error" />
        </div>
      </template>
    </IonList>
  </template>
</template>

<style scoped>
.day {
  font-size: 1rem;
  margin: 0.5rem 0 0;
}
</style>
