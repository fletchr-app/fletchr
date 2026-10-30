<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import AppButton from '@/components/AppButton.vue'
import ChipGroup from '@/components/ChipGroup.vue'
import ErrorText from '@/components/ErrorText.vue'
import FormField from '@/components/FormField.vue'
import { useAuth } from '@/composables/useAuth'
import { useRemote } from '@/composables/useRemote'
import { useSchedule } from '@/composables/useSchedule'
import type { components } from '@/lib/api-types'

type Slot = components['schemas']['Slot']

// The weekly trainings of a team (coaches). Their occurrences are in the agenda. The times of a slot whose later trainings are
// in use cannot change in place: "change from" ends the slot and starts a new one on the chosen day.
const props = defineProps<{ teamId: number }>()
const { t, locale } = useI18n()
const { api } = useAuth()
const { putSlot, deleteSlot } = useSchedule()
const slots = useRemote(async () => (await api.GET('/api/slots/', { params: { query: { team: props.teamId } } })).data ?? null)

const weekdayName = (i: number, style: 'short' | 'long' = 'short') => new Date(2024, 0, 1 + i).toLocaleDateString(locale.value, { weekday: style })
const WEEKDAYS = computed(() => [0, 1, 2, 3, 4, 5, 6].map((i) => ({ value: String(i), label: weekdayName(i) })))
const clock = (time: string) => time.slice(0, 5)
const line = (s: Slot) =>
  [`${weekdayName(s.weekday, 'long')} ${clock(s.start_time)}–${clock(s.end_time)}`, s.name, s.location, s.valid_until ? t('schedule.endsOn', { date: s.valid_until }) : ''].filter(Boolean).join(' · ')

const open = ref(false)
const editing = ref<Slot | null>(null)
const weekday = ref('2')
const startTime = ref('18:00')
const endTime = ref('19:30')
const timeZone = ref(Intl.DateTimeFormat().resolvedOptions().timeZone)
const name = ref('')
const location = ref('')
const validFrom = ref('')
const validUntil = ref('')
const pauseFrom = ref('')
const pauseUntil = ref('')
const changeFrom = ref('')
const askChangeFrom = ref(false)
const error = ref<string | null>(null)
const confirmDelete = ref(false)

const today = () => new Date().toISOString().slice(0, 10)
function edit(slot: Slot | null) {
  editing.value = slot
  open.value = true
  error.value = null
  askChangeFrom.value = false
  confirmDelete.value = false
  weekday.value = String(slot?.weekday ?? 2)
  startTime.value = clock(slot?.start_time ?? '18:00')
  endTime.value = clock(slot?.end_time ?? '19:30')
  timeZone.value = slot?.time_zone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
  name.value = slot?.name ?? ''
  location.value = slot?.location ?? ''
  validFrom.value = slot?.valid_from ?? today()
  validUntil.value = slot?.valid_until ?? ''
  pauseFrom.value = slot?.pause_from ?? ''
  pauseUntil.value = slot?.pause_until ?? ''
  changeFrom.value = today()
}
const values = () => ({
  weekday: Number(weekday.value), start_time: startTime.value, end_time: endTime.value, time_zone: timeZone.value.trim(), name: name.value.trim(), location: location.value.trim(),
  valid_from: validFrom.value, valid_until: validUntil.value || null, pause_from: pauseFrom.value || null, pause_until: pauseUntil.value || null,
})
const done = () => {
  open.value = false
  slots.reload()
}

async function save() {
  error.value = null
  const result = await putSlot(props.teamId, editing.value?.id ?? null, values())
  if (result.ok) return done()
  if (result.status === 409) askChangeFrom.value = true
  error.value = result.message
}

/** Start a new slot with the new values on `changeFrom`, then end the old one the day before. */
async function changeFromDay() {
  const old = editing.value
  if (!old || !changeFrom.value) return
  const before = new Date(`${changeFrom.value}T12:00:00Z`)
  before.setUTCDate(before.getUTCDate() - 1)
  const created = await putSlot(props.teamId, null, { ...values(), valid_from: changeFrom.value, valid_until: old.valid_until ?? null })
  if (!created.ok) return void (error.value = created.message)
  const ended = await putSlot(props.teamId, old.id, { valid_until: before.toISOString().slice(0, 10) })
  if (!ended.ok) return void (error.value = ended.message)
  done()
}

async function remove() {
  if (!editing.value) return
  if (!confirmDelete.value) return void (confirmDelete.value = true)
  const result = await deleteSlot(editing.value.id)
  if (result.ok) done()
  else error.value = result.message
}
</script>

<template>
  <div class="d-flex flex-column gap-2">
    <h2 class="h5 m-0">{{ $t('schedule.slots') }}</h2>
    <ErrorText :message="slots.error.value" />
    <div v-if="slots.data.value?.length === 0" class="muted">{{ $t('schedule.noSlots') }}</div>
    <div v-for="slot in slots.data.value" :key="slot.id" class="d-flex gap-2 align-items-baseline">
      <span class="flex-grow-1">{{ line(slot) }}</span>
      <a href="#" @click.prevent="edit(slot)">{{ $t('notes.edit') }}</a>
    </div>
    <AppButton v-if="!open" secondary @click="edit(null)">{{ $t('schedule.addSlot') }}</AppButton>
    <div v-if="open" class="d-flex flex-column gap-2">
      <ChipGroup v-model="weekday" :label="$t('schedule.weekday')" :options="WEEKDAYS" />
      <div class="row g-3">
        <div class="col-6"><FormField v-model="startTime" type="time" :label="$t('schedule.start')" /></div>
        <div class="col-6"><FormField v-model="endTime" type="time" :label="$t('schedule.end')" /></div>
      </div>
      <FormField v-model="name" :label="$t('schedule.name')" capitalize="sentences" />
      <FormField v-model="location" :label="$t('schedule.location')" capitalize="sentences" />
      <FormField v-model="timeZone" :label="$t('schedule.timeZone')" />
      <FormField v-model="validFrom" type="date" :label="$t('schedule.from')" />
      <FormField v-model="validUntil" type="date" :label="$t('schedule.until')" />
      <FormField v-model="pauseFrom" type="date" :label="$t('schedule.pauseFrom')" />
      <FormField v-model="pauseUntil" type="date" :label="$t('schedule.pauseUntil')" />
      <ErrorText :message="error" />
      <template v-if="askChangeFrom">
        <FormField v-model="changeFrom" type="date" :label="$t('schedule.changeFromDay')" />
        <AppButton @click="changeFromDay">{{ $t('schedule.changeFrom') }}</AppButton>
      </template>
      <AppButton v-else @click="save">{{ $t('common.save') }}</AppButton>
      <AppButton v-if="editing" secondary @click="remove">{{ confirmDelete ? $t('schedule.deleteConfirm') : $t('common.delete') }}</AppButton>
      <AppButton secondary @click="open = false">{{ $t('common.cancel') }}</AppButton>
    </div>
  </div>
</template>
