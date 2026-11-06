<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'

import AgendaDayList from '@/components/AgendaDayList.vue'
import AppButton from '@/components/AppButton.vue'
import AppPage from '@/components/AppPage.vue'
import ChipGroup from '@/components/ChipGroup.vue'
import ErrorText from '@/components/ErrorText.vue'
import FormField from '@/components/FormField.vue'
import MonthGrid from '@/components/MonthGrid.vue'
import { useAuth } from '@/composables/useAuth'
import { useRemote } from '@/composables/useRemote'
import { useSchedule } from '@/composables/useSchedule'
import { useScheduleCache } from '@/composables/useScheduleCache'
import { addMonths, dotsByDay, daysOf, firstWeekday, monthGrid, rangeOf } from '@/lib/calendar'
import { dayKey, fromLocalInput, groupByDay, newEventTimes } from '@/lib/schedule'
import { covers, itemsFor } from '@/lib/schedule-cache'

// What is on in a team, as a list (the last four weeks and the next eight, by day) or as a month with the trainings of one day below it. Coaches cancel, move and add trainings, and open one to
// add notes and photos for an archer. Trainings from a slot are rows only once something is done to them.
// Without a connection the copy on the phone is shown, read only: every change needs the server.
const DAY_MS = 86_400_000
const { t, locale } = useI18n()
const route = useRoute()
const teamId = Number(route.params.id)
const { api } = useAuth()
const { addEvent } = useSchedule()

const cache = useScheduleCache()
/** True while what is shown is the copy on the phone, because the server could not be reached. */
const offline = ref(false)
const cachedTeam = () => cache.state.value.teams.find((x) => x.id === teamId) ?? null
const team = useRemote(async () => {
  try {
    const { data, response } = await api.GET('/api/teams/{team_id}/', { params: { path: { team_id: teamId } } })
    if (data || response.status < 500) return data ?? null
  } catch {
    /* no connection: the copy below */
  }
  return cachedTeam()
})
const isCoach = computed(() => !offline.value && team.data.value?.my_role !== undefined && team.data.value.my_role !== 'archer')

// The mode is remembered on this device.
const MODE_KEY = 'agenda:mode'
const readMode = (): 'list' | 'month' => {
  try {
    return globalThis.localStorage?.getItem(MODE_KEY) === 'month' ? 'month' : 'list'
  } catch {
    return 'list'
  }
}
const mode = ref<'list' | 'month'>(readMode())
const MODES = computed(() => (['list', 'month'] as const).map((value) => ({ value, label: t(`schedule.${value}Mode`) })))
function setMode(value: 'list' | 'month') {
  mode.value = value
  try {
    globalThis.localStorage?.setItem(MODE_KEY, value)
  } catch {
    // not remembered
  }
}

const today = dayKey(new Date().toISOString())
const thisMonth = today.slice(0, 7)
const month = ref(thisMonth)
const picked = ref(today)
const grid = computed(() => monthGrid(month.value, firstWeekday(locale.value)))
const listFrom = new Date(Date.now() - 28 * DAY_MS).toISOString()
const listTo = new Date(Date.now() + 56 * DAY_MS).toISOString()
// The month mode asks for the days of the grid, the list mode for its fixed range.
const range = computed(() => (mode.value === 'month' ? rangeOf(grid.value) : { from: listFrom, to: listTo }))
// Server first; the copy when the server cannot be reached (no connection, or it is down).
const agenda = useRemote(
  async () => {
    const query = { team: teamId, ...range.value }
    try {
      const { data, response } = await api.GET('/api/events/agenda/', { params: { query } })
      if (data || response.status < 500) {
        offline.value = false
        return data ?? null
      }
    } catch {
      /* no connection: the copy below */
    }
    if (!cache.state.value.pulledAt || !cachedTeam()) throw new Error('server not reachable')
    offline.value = true
    return itemsFor(cache.state.value, query)
  },
  { watch: [range] },
)
// Back online (the schedule was pulled again): show the server's agenda.
watch(cache.pulls, () => {
  if (offline.value) {
    agenda.reload()
    team.reload()
  }
})
const savedAt = computed(() => {
  const at = cache.state.value.pulledAt
  return at ? new Date(at).toLocaleString(locale.value, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''
})
// A month outside the copy (a month back, three ahead) is not on the phone.
const notOnPhone = computed(() => offline.value && !covers(cache.state.value, range.value.from, range.value.to))
function shift(step: -1 | 1) {
  month.value = addMonths(month.value, step)
  picked.value = month.value === thisMonth ? today : `${month.value}-01`
}
function goToday() {
  month.value = thisMonth
  picked.value = today
}
const members = useRemote(async () => {
  const list = (await api.GET('/api/teams/{team_id}/members/', { params: { path: { team_id: teamId } } })).data
  return list ? list.filter((m) => m.role === 'archer' || m.also_shoots) : null
})
const days = computed(() => groupByDay(agenda.data.value ?? []))
const dots = computed(() => dotsByDay(agenda.data.value ?? []))
// The trainings of the picked day, also those of a camp that began before it.
const dayItems = computed(() => (agenda.data.value ?? []).filter((item) => daysOf(item).includes(picked.value)).sort((a, b) => a.start.localeCompare(b.start)))
const pickedDays = computed(() => (dayItems.value.length ? [{ day: picked.value, items: dayItems.value }] : []))

const error = ref<string | null>(null)
const start = ref('')
const end = ref('')
const location = ref('')

// A one-off: a competition, an extra training, a camp.
const adding = ref(false)
const kind = ref<'training' | 'competition' | 'camp'>('competition')
const KINDS = computed(() => (['training', 'competition', 'camp'] as const).map((value) => ({ value, label: t(`event.kind.${value}`) })))
const name = ref('')
async function add() {
  const [s, e] = [fromLocalInput(start.value), fromLocalInput(end.value)]
  if (!s || !e || e <= s) return void (error.value = t('schedule.endAfterStart'))
  error.value = null
  const result = await addEvent(teamId, { kind: kind.value, name: name.value.trim(), start: s, end: e, location: location.value.trim() })
  if (!result.ok) return void (error.value = result.message)
  adding.value = false
  name.value = location.value = ''
  agenda.reload()
}
function startAdding() {
  // In month mode the picked day, so a coach who chose a day does not have to change the date.
  const times = newEventTimes(new Date(), mode.value === 'month' ? picked.value : undefined)
  start.value = times.start
  end.value = times.end
  location.value = ''
  adding.value = true
}
</script>

<template>
  <AppPage :title="team.data.value ? $t('schedule.agendaOf', { name: team.data.value.name }) : $t('schedule.agenda')">
    <div class="screen">
      <ErrorText :message="agenda.error.value" />
      <div v-if="offline" class="muted">{{ $t('schedule.savedAsOf', { time: savedAt }) }}</div>
      <div v-if="notOnPhone" class="muted">{{ $t('schedule.notOnPhone') }}</div>
      <AppButton v-if="isCoach && !adding" secondary @click="startAdding">{{ $t('schedule.oneOff') }}</AppButton>
      <div v-if="adding && !offline" class="d-flex flex-column gap-2">
        <ChipGroup v-model="kind" :options="KINDS" />
        <FormField v-model="name" :label="$t('schedule.name')" capitalize="sentences" />
        <FormField v-model="start" type="datetime-local" :label="$t('schedule.start')" />
        <FormField v-model="end" type="datetime-local" :label="$t('schedule.end')" />
        <FormField v-model="location" :label="$t('schedule.location')" capitalize="sentences" />
        <ErrorText :message="error" />
        <AppButton @click="add">{{ $t('common.save') }}</AppButton>
        <AppButton secondary @click="adding = false">{{ $t('common.cancel') }}</AppButton>
      </div>
      <ChipGroup :model-value="mode" :options="MODES" @update:model-value="setMode" />
      <div v-if="agenda.loading.value">{{ $t('common.loading') }}</div>
      <template v-else-if="mode === 'month'">
        <MonthGrid :month="month" :days="grid" :dots="dots" :selected="picked" :today="today" @select="picked = $event" @shift="shift" @today="goToday" />
        <div v-if="pickedDays.length === 0 && !agenda.error.value" class="muted">{{ $t('schedule.nothingThisDay') }}</div>
        <AgendaDayList :days="pickedDays" :can-plan="() => isCoach" :members="members.data.value" :read-only="offline" @changed="agenda.reload()" />
      </template>
      <template v-else>
        <div v-if="days.length === 0 && !agenda.error.value">{{ $t('schedule.nothing') }}</div>
        <AgendaDayList :days="days" :can-plan="() => isCoach" :members="members.data.value" :read-only="offline" @changed="agenda.reload()" />
      </template>
    </div>
  </AppPage>
</template>
