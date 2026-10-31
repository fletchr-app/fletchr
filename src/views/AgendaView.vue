<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'

import AgendaDayList from '@/components/AgendaDayList.vue'
import AppButton from '@/components/AppButton.vue'
import AppPage from '@/components/AppPage.vue'
import ChipGroup from '@/components/ChipGroup.vue'
import ErrorText from '@/components/ErrorText.vue'
import FormField from '@/components/FormField.vue'
import { useAuth } from '@/composables/useAuth'
import { useRemote } from '@/composables/useRemote'
import { useSchedule } from '@/composables/useSchedule'
import { fromLocalInput, groupByDay, toLocalInput } from '@/lib/schedule'

// What is on in a team: the last four weeks and the next eight, by day. Coaches cancel, move and add trainings, and open one to
// add notes and photos for an archer. Trainings from a slot are rows only once something is done to them.
const DAY_MS = 86_400_000
const { t } = useI18n()
const route = useRoute()
const teamId = Number(route.params.id)
const { api } = useAuth()
const { addEvent } = useSchedule()

const team = useRemote(async () => (await api.GET('/api/teams/{team_id}/', { params: { path: { team_id: teamId } } })).data ?? null)
const isCoach = computed(() => team.data.value?.my_role !== undefined && team.data.value.my_role !== 'archer')
const from = new Date(Date.now() - 28 * DAY_MS).toISOString()
const to = new Date(Date.now() + 56 * DAY_MS).toISOString()
const agenda = useRemote(async () => (await api.GET('/api/events/agenda/', { params: { query: { team: teamId, from, to } } })).data ?? null)
const members = useRemote(async () => {
  const list = (await api.GET('/api/teams/{team_id}/members/', { params: { path: { team_id: teamId } } })).data
  return list ? list.filter((m) => m.role === 'archer' || m.also_shoots) : null
})
const days = computed(() => groupByDay(agenda.data.value ?? []))

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
  const now = new Date()
  now.setHours(now.getHours() + 1, 0, 0, 0)
  start.value = toLocalInput(now.toISOString())
  end.value = toLocalInput(new Date(now.getTime() + 2 * 3_600_000).toISOString())
  location.value = ''
  adding.value = true
}
</script>

<template>
  <AppPage :title="team.data.value ? $t('schedule.agendaOf', { name: team.data.value.name }) : $t('schedule.agenda')">
    <div class="screen">
      <ErrorText :message="agenda.error.value" />
      <AppButton v-if="isCoach && !adding" secondary @click="startAdding">{{ $t('schedule.oneOff') }}</AppButton>
      <div v-if="adding" class="d-flex flex-column gap-2">
        <ChipGroup v-model="kind" :options="KINDS" />
        <FormField v-model="name" :label="$t('schedule.name')" capitalize="sentences" />
        <FormField v-model="start" type="datetime-local" :label="$t('schedule.start')" />
        <FormField v-model="end" type="datetime-local" :label="$t('schedule.end')" />
        <FormField v-model="location" :label="$t('schedule.location')" capitalize="sentences" />
        <ErrorText :message="error" />
        <AppButton @click="add">{{ $t('common.save') }}</AppButton>
        <AppButton secondary @click="adding = false">{{ $t('common.cancel') }}</AppButton>
      </div>
      <div v-if="agenda.loading.value">{{ $t('common.loading') }}</div>
      <div v-else-if="days.length === 0 && !agenda.error.value">{{ $t('schedule.nothing') }}</div>
      <AgendaDayList :days="days" :can-plan="() => isCoach" :members="members.data.value" @changed="agenda.reload()" />
    </div>
  </AppPage>
</template>
