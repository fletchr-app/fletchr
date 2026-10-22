<script setup lang="ts">
import { IonItem, IonLabel, IonList, onIonViewWillEnter } from '@ionic/vue'
import { ref } from 'vue'

import AppButton from '@/components/AppButton.vue'
import AppPage from '@/components/AppPage.vue'
import ErrorText from '@/components/ErrorText.vue'
import { useAuth } from '@/composables/useAuth'
import { useCreateTeam } from '@/composables/useCreateTeam'
import type { components } from '@/lib/api-types'

type Team = components['schemas']['Team']

const { api, signOut } = useAuth()
const teams = ref<Team[] | null>(null)
const creating = useCreateTeam()

// The team screens are for coaches only. Checked each time the screen is shown (it stays alive, and you may have created a team).
onIonViewWillEnter(() =>
  api
    .GET('/api/teams/')
    .then((res) => (teams.value = res.data ?? null))
    .catch(() => undefined),
)
</script>

<template>
  <AppPage title="More" :back="false">
    <div class="screen">
      <IonList inset>
        <IonItem v-if="teams?.some((t) => t.my_role !== 'archer')" router-link="/team" detail lines="full"><IonLabel>Team (coach)</IonLabel></IonItem>
        <IonItem router-link="/equipment" detail lines="full"><IonLabel>My equipment</IonLabel></IonItem>
        <IonItem router-link="/join-team" detail lines="full"><IonLabel>Join another team</IonLabel></IonItem>
        <IonItem button detail lines="full" @click="creating.ask"><IonLabel>Create a team</IonLabel></IonItem>
        <IonItem router-link="/privacy" detail lines="full"><IonLabel>Your data</IonLabel></IonItem>
        <IonItem router-link="/settings" detail lines="none"><IonLabel>Settings</IonLabel></IonItem>
      </IonList>
      <ErrorText :message="creating.error.value" />
      <AppButton secondary @click="signOut">Sign out</AppButton>
    </div>
  </AppPage>
</template>
