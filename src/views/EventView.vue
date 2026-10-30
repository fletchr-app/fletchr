<script setup lang="ts">
import { IonItem, IonLabel, IonList } from '@ionic/vue'

import AppButton from '@/components/AppButton.vue'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, useRoute } from 'vue-router'

import AppPage from '@/components/AppPage.vue'
import ErrorText from '@/components/ErrorText.vue'
import NewNote from '@/components/NewNote.vue'
import NoteRow from '@/components/NoteRow.vue'
import SessionPicker from '@/components/SessionPicker.vue'
import { useAuth } from '@/composables/useAuth'
import { useRemote } from '@/composables/useRemote'
import { useTeams } from '@/composables/useTeams'
import { eventTitle, type EventLink } from '@/lib/schedule'

// A team training with what the archers and coaches linked to it: for a coach the archers who took part and all notes and
// photos they may read; for one archer (`?archer=`) that archer's notes and photos of it.
const REFRESH_MS = 15000
const { t } = useI18n()
const route = useRoute()
const id = route.params.id as string
const archer = route.query.archer ? Number(route.query.archer) : null
const { api, userId } = useAuth()
const { teams } = useTeams()
const poll = { pollMs: REFRESH_MS, keepPolling: () => true }

const event = useRemote(async () => (await api.GET('/api/events/{event_id}/', { params: { path: { event_id: id } } })).data ?? null)
const isCoach = computed(() => teams.value.some((x) => x.id === event.data.value?.team && x.my_role !== 'archer'))
const archers = useRemote(async () => {
  if (archer !== null || !isCoach.value) return []
  return (await api.GET('/api/events/{event_id}/archers/', { params: { path: { event_id: id } } })).data ?? null
}, { ...poll, watch: [isCoach] })
const notes = useRemote(async () => (await api.GET('/api/notes/', { params: { query: { event: id, ...(archer !== null ? { archer } : {}) } } })).data ?? null, poll)
const media = useRemote(async () => (await api.GET('/api/media/', { params: { query: { event: id, ...(archer !== null ? { owner: archer } : {}) } } })).data ?? null, poll)
const writable = useRemote(async () => {
  if (archer === null || archer === Number(userId.value)) return []
  return (await api.GET('/api/notes/teams/', { params: { query: { archer } } })).data ?? null
})

const title = computed(() => {
  const e = event.data.value
  if (!e) return t('event.title')
  const name = eventTitle(e)
  return name.startsWith('event.kind.') ? t(name) : name
})
const link = computed<EventLink | null>(() => {
  const e = event.data.value
  return e ? { id: e.id, name: e.name, kind: e.kind, start: e.start, team: e.team, team_name: e.team_name } : null
})
const when = computed(() => (event.data.value ? `${new Date(event.data.value.start).toLocaleString()} – ${new Date(event.data.value.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''))

// What this archer has in the training and in no session can be put into one of their sessions (the rows keep the training).
const pickerOpen = ref(false)
const attachError = ref<string | null>(null)
const loose = computed(() => (notes.data.value ?? []).some((n) => !n.session) || (media.data.value ?? []).some((m) => !m.session))
async function attach(session: string | null) {
  pickerOpen.value = false
  if (session === null || archer === null) return
  attachError.value = null
  try {
    const { response } = await api.POST('/api/events/{event_id}/attach/', { params: { path: { event_id: id } }, body: { archer, session } })
    if (!response.ok) attachError.value = t('event.attachFailed')
  } catch {
    attachError.value = t('common.serverNotReachable')
  }
  reloadAll()
}
const reloadAll = () => {
  notes.reload()
  media.reload()
  archers.reload()
}
</script>

<template>
  <AppPage :title="title">
    <div class="screen">
      <ErrorText :message="event.error.value" />
      <div v-if="event.loading.value">{{ $t('common.loading') }}</div>
      <template v-if="event.data.value">
        <div>
          <div>{{ when }}</div>
          <div class="muted">{{ [event.data.value.team_name, event.data.value.location].filter(Boolean).join(' · ') }}</div>
          <div v-if="event.data.value.cancelled" class="text-danger">{{ $t('schedule.cancelled') }}</div>
        </div>

        <template v-if="archer === null && archers.data.value">
          <h2 class="h5 m-0">{{ $t('event.archers') }}</h2>
          <div v-if="archers.data.value.length === 0" class="muted">{{ $t('event.nobody') }}</div>
          <IonList v-else inset>
            <IonItem v-for="a in archers.data.value" :key="a.user_id" :router-link="a.sessions.length === 1 ? `/sessions/${a.sessions[0]}` : `/events/${id}?archer=${a.user_id}`" detail lines="full">
              <IonLabel class="ion-text-wrap">
                <h3>{{ a.name }}</h3>
                <p>{{ [a.sessions.length > 0 ? $t('count.sessions', a.sessions.length) : '', $t('count.notes', a.notes), $t('count.media', a.media)].filter(Boolean).join(' · ') }}</p>
              </IonLabel>
            </IonItem>
          </IonList>
        </template>

        <template v-if="archer !== null && link && writable.data.value?.length">
          <NewNote :archer-id="archer" :ends="[]" :event="link" :teams="writable.data.value" @added="reloadAll" />
        </template>

        <template v-if="archer !== null && loose">
          <AppButton secondary @click="pickerOpen = true">{{ $t('event.attach') }}</AppButton>
          <ErrorText :message="attachError" />
        </template>
        <SessionPicker v-if="archer !== null" :open="pickerOpen" :owner="archer" :taken-at="event.data.value.start" :current="null" server-items :removable="false" @close="pickerOpen = false" @pick="attach" />

        <h2 class="h5 m-0">{{ $t('event.notes') }}</h2>
        <ErrorText :message="notes.error.value" />
        <div v-if="notes.data.value?.length === 0" class="muted">{{ $t('event.noNotes') }}</div>
        <NoteRow v-for="note in notes.data.value" :key="note.id" :note="note" :ends="[]" picture @changed="reloadAll" />

        <h2 class="h5 m-0">{{ $t('event.media') }}</h2>
        <ErrorText :message="media.error.value" />
        <div v-if="media.data.value?.length === 0" class="muted">{{ $t('event.noMedia') }}</div>
        <div class="grid">
          <RouterLink v-for="m in media.data.value" :key="m.id" :to="`/media/${m.id}`"><img :src="m.thumbnail_url" alt="" /></RouterLink>
        </div>
      </template>
    </div>
  </AppPage>
</template>

<style scoped>
.grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
}
.grid img {
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
}
</style>
