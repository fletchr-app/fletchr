<script setup lang="ts">
import { IonItem, IonLabel, IonList } from '@ionic/vue'
import { onMounted, ref } from 'vue'

import AppButton from '@/components/AppButton.vue'
import AppPage from '@/components/AppPage.vue'
import { useAuth } from '@/composables/useAuth'
import type { components } from '@/lib/api-types'

type Team = components['schemas']['Team']

const { api, signOut } = useAuth()
const teams = ref<Team[] | null>(null)

// The team screens are for coaches only.
onMounted(() =>
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
        <IonItem router-link="/privacy" detail lines="full"><IonLabel>Your data</IonLabel></IonItem>
        <IonItem router-link="/settings" detail lines="none"><IonLabel>Settings</IonLabel></IonItem>
      </IonList>
      <AppButton secondary @click="signOut">Sign out</AppButton>
    </div>
  </AppPage>
</template>
