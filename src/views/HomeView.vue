<script setup lang="ts">
import { IonItem, IonLabel, IonList, IonListHeader, IonNote, onIonViewWillEnter } from '@ionic/vue'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import AppButton from '@/components/AppButton.vue'
import AppPage from '@/components/AppPage.vue'
import ErrorText from '@/components/ErrorText.vue'
import LatestGoals from '@/components/LatestGoals.vue'
import LatestNotes from '@/components/LatestNotes.vue'
import SessionListItem from '@/components/SessionListItem.vue'
import VersionBanner from '@/components/VersionBanner.vue'
import { useAuth } from '@/composables/useAuth'
import { useLog } from '@/composables/useLog'
import { useRemote } from '@/composables/useRemote'
import { useTeams } from '@/composables/useTeams'
import type { components } from '@/lib/api-types'
import { arrowsSince, sessionRows, weekStart } from '@/lib/session-rows'

type Me = components['schemas']['Me']

const { api, userId, isLocal } = useAuth()
const me = ref<Me | null>(null)
const { t } = useI18n()
const { teams, loaded, load } = useTeams()
const error = ref<string | null>(null)

// Your own sessions, the same list as the Training tab: those on the device (also the ones not uploaded yet) and the server's.
const { sessions: local, goneSessions } = useLog()
// Without an account the device is the only source.
const remote = useRemote(async () => (isLocal.value ? [] : ((await api.GET('/api/sessions/', { params: { query: { owner: Number(userId.value) } } })).data ?? null)))
const rows = computed(() => sessionRows(local.value.filter((s) => !s.owner), remote.data.value ?? [], goneSessions.value))
const lastSession = computed(() => rows.value[0])
const weekArrows = computed(() => arrowsSince(rows.value, weekStart(new Date())))
const sessionsKnown = computed(() => !remote.loading.value || rows.value.length > 0)

// Each time the screen is shown: it stays alive between visits, so a new team or note would not appear otherwise.
const shown = ref(0)
let firstVisit = true // the first load happens when the screen is created
onIonViewWillEnter(() => {
  shown.value++
  if (firstVisit) firstVisit = false
  else remote.reload()
  if (isLocal.value) return
  return Promise.all([api.GET('/api/me/'), load()])
    .then(([meRes]) => {
      if (meRes.data) me.value = meRes.data
      error.value = meRes.data ? null : t('common.couldNotLoadData')
    })
    .catch(() => (error.value = t('common.serverNotReachable')))
})
</script>

<template>
  <AppPage title="Fletchr" :back="false">
    <div class="screen">
      <h2 class="h4 m-0">{{ me ? $t('home.hello', { name: me.profile.name || me.email }) : isLocal ? $t('local.homeTitle') : 'Fletchr' }}</h2>
      <VersionBanner />
      <ErrorText :message="error" />
      <template v-if="sessionsKnown">
        <div v-if="rows.length === 0" class="d-flex flex-column gap-2">
          <div>{{ $t('home.noSessions') }}</div>
          <AppButton router-link="/training/new">{{ $t('training.start') }}</AppButton>
        </div>
        <template v-else>
          <div>
            <div class="muted">{{ $t('home.thisWeek') }}</div>
            <div class="fs-2 fw-semibold">{{ weekArrows }}</div>
            <div class="faint">{{ $t('home.arrowsShot') }}</div>
          </div>
          <IonList inset>
            <IonListHeader>{{ $t('home.lastSession') }}</IonListHeader>
            <SessionListItem v-if="lastSession" :row="lastSession" lines="none" />
          </IonList>
        </template>
      </template>
      <LatestGoals v-if="me" :user-id="me.id" :refresh="shown" />
      <LatestNotes v-if="me" :user-id="me.id" :refresh="shown" />
      <IonList inset>
        <IonItem router-link="/media" detail lines="full">
          <IonLabel>{{ $t('media.link') }}</IonLabel>
        </IonItem>
        <IonItem v-if="me" :router-link="`/archers/${me.id}/evaluations`" detail lines="none">
          <IonLabel>{{ $t('evaluations.title') }}</IonLabel>
        </IonItem>
      </IonList>
      <div v-if="loaded && teams.length === 0">{{ $t('home.noTeam') }}</div>
      <IonList v-if="teams.length > 0" inset>
        <IonListHeader>{{ $t('home.yourTeams') }}</IonListHeader>
        <IonItem v-for="team in teams" :key="team.id" :router-link="`/team/${team.id}`" detail lines="full">
          <IonLabel>{{ team.name }}</IonLabel>
          <IonNote slot="end">{{ $t(`roles.${team.my_role}`) }}</IonNote>
        </IonItem>
      </IonList>
    </div>
  </AppPage>
</template>
