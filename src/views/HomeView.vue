<script setup lang="ts">
import { IonItem, IonLabel, IonList, IonListHeader, IonNote, onIonViewWillEnter } from '@ionic/vue'
import { ref } from 'vue'

import AppPage from '@/components/AppPage.vue'
import ErrorText from '@/components/ErrorText.vue'
import LatestNotes from '@/components/LatestNotes.vue'
import { useAuth } from '@/composables/useAuth'
import type { components } from '@/lib/api-types'

type Me = components['schemas']['Me']
type Team = components['schemas']['Team']

const { api } = useAuth()
const me = ref<Me | null>(null)
const teams = ref<Team[] | null>(null)
const error = ref<string | null>(null)

// Each time the screen is shown: it stays alive between visits, so a new team would not appear otherwise.
onIonViewWillEnter(() =>
  Promise.all([api.GET('/api/me/'), api.GET('/api/teams/')])
    .then(([meRes, teamsRes]) => {
      if (meRes.data) me.value = meRes.data
      if (teamsRes.data) teams.value = teamsRes.data
      error.value = meRes.data && teamsRes.data ? null : 'Could not load your data'
    })
    .catch(() => (error.value = 'Server not reachable')),
)
</script>

<template>
  <AppPage title="Archery Coach" :back="false">
    <div class="screen">
      <h2 class="h4 m-0">{{ me ? `Hello ${me.profile.name || me.email}` : 'Archery Coach' }}</h2>
      <ErrorText :message="error" />
      <LatestNotes v-if="me" :user-id="me.id" />
      <div v-if="teams?.length === 0">You are not in a team yet. Under More you can join one with an invite code, or create your own.</div>
      <IonList v-if="teams?.length" inset>
        <IonListHeader>Your teams</IonListHeader>
        <IonItem v-for="team in teams" :key="team.id" lines="full">
          <IonLabel>{{ team.name }}</IonLabel>
          <IonNote slot="end">{{ team.my_role }}</IonNote>
        </IonItem>
      </IonList>
    </div>
  </AppPage>
</template>
