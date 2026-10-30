<script setup lang="ts">
import { IonItem, IonLabel, IonList } from '@ionic/vue'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import AppButton from '@/components/AppButton.vue'
import AppPage from '@/components/AppPage.vue'
import ChipGroup from '@/components/ChipGroup.vue'
import ErrorText from '@/components/ErrorText.vue'
import FormField from '@/components/FormField.vue'
import { useAuth } from '@/composables/useAuth'
import { useRemote } from '@/composables/useRemote'
import { useSchedule } from '@/composables/useSchedule'
import { type AgendaItem, eventTitle, fromLocalInput, groupByDay, toLocalInput } from '@/lib/schedule'

// What is on in a team: the last four weeks and the next eight, by day. Coaches cancel, move and add trainings, and open one to
// add notes and photos for an archer. Trainings from a slot are rows only once something is done to them.
const DAY_MS = 86_400_000
const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const teamId = Number(route.params.id)
const { api } = useAuth()
const { putEvent, addEvent } = useSchedule()

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

const selected = ref<AgendaItem | null>(null)
const mode = ref<'' | 'move'>('')
const error = ref<string | null>(null)
const archer = ref('')
const start = ref('')
const end = ref('')
const location = ref('')

const title = (item: AgendaItem) => {
  const name = eventTitle(item)
  return name.startsWith('event.kind.') ? t(name) : name
}
const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
const dayTitle = (day: string) => new Date(`${day}T12:00`).toLocaleDateString(locale.value, { weekday: 'long', day: 'numeric', month: 'long' })

function select(item: AgendaItem) {
  selected.value = selected.value?.id === item.id ? null : item
  mode.value = ''
  error.value = null
  archer.value = ''
}
function startMove(item: AgendaItem) {
  start.value = toLocalInput(item.start)
  end.value = toLocalInput(item.end)
  location.value = item.location
  mode.value = 'move'
}

async function change(item: AgendaItem, changes: Parameters<typeof putEvent>[1]) {
  error.value = null
  const result = await putEvent(item, changes)
  if (!result.ok) return void (error.value = result.message)
  selected.value = null
  mode.value = ''
  agenda.reload()
}
const move = (item: AgendaItem) => {
  const [s, e] = [fromLocalInput(start.value), fromLocalInput(end.value)]
  if (!s || !e || e <= s) return void (error.value = t('schedule.endAfterStart'))
  return change(item, { start: s, end: e, location: location.value.trim() })
}

/** The training as a row: an occurrence nobody linked to is made one first. */
async function row(item: AgendaItem): Promise<string | null> {
  if (!item.virtual) return item.id
  const result = await putEvent(item)
  if (!result.ok) {
    error.value = result.message
    return null
  }
  agenda.reload()
  return result.data.id
}
async function open(item: AgendaItem, path: (id: string) => string) {
  error.value = null
  const id = await row(item)
  if (id) void router.push(path(id))
}
const archerName = () => members.data.value?.find((m) => String(m.user_id) === archer.value)?.name ?? ''
const addMedia = (item: AgendaItem) => {
  const slot = item.virtual ? `&slot=${item.slot}&date=${item.date}` : ''
  void router.push(`/media?owner=${archer.value}&name=${encodeURIComponent(archerName())}&event=${item.id}${slot}`)
}

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
      <template v-for="d in days" :key="d.day">
        <h3 class="day">{{ dayTitle(d.day) }}</h3>
        <IonList inset>
          <template v-for="item in d.items" :key="item.id">
            <IonItem button detail lines="full" @click="select(item)">
              <IonLabel class="ion-text-wrap">
                <h3 :class="{ 'text-decoration-line-through': item.cancelled }">{{ clock(item.start) }}–{{ clock(item.end) }} · {{ title(item) }}</h3>
                <p>{{ [item.cancelled ? $t('schedule.cancelled') : '', item.location].filter(Boolean).join(' · ') }}</p>
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
                <template v-if="isCoach">
                  <ChipGroup v-if="members.data.value?.length" v-model="archer" :label="$t('schedule.forArcher')" :options="members.data.value.map((m) => ({ value: String(m.user_id), label: m.name }))" />
                  <AppButton v-if="archer && !item.cancelled" @click="open(item, (id) => `/events/${id}?archer=${archer}`)">{{ $t('schedule.addNote') }}</AppButton>
                  <AppButton v-if="archer && !item.cancelled" secondary @click="addMedia(item)">{{ $t('schedule.addMedia') }}</AppButton>
                </template>
                <AppButton secondary @click="open(item, (id) => `/events/${id}`)">{{ $t('schedule.openEvent') }}</AppButton>
                <AppButton v-if="isCoach" secondary @click="startMove(item)">{{ $t('schedule.move') }}</AppButton>
                <AppButton v-if="isCoach" secondary @click="change(item, { cancelled: !item.cancelled })">{{ item.cancelled ? $t('schedule.reinstate') : $t('schedule.cancel') }}</AppButton>
              </template>
              <ErrorText :message="error" />
            </div>
          </template>
        </IonList>
      </template>
    </div>
  </AppPage>
</template>

<style scoped>
.day {
  font-size: 1rem;
  margin: 0.5rem 0 0;
}
</style>
