<script setup lang="ts">
import { IonItem, IonLabel, IonList } from '@ionic/vue'

import AppButton from '@/components/AppButton.vue'
import AppPage from '@/components/AppPage.vue'
import ErrorText from '@/components/ErrorText.vue'
import { useAuth } from '@/composables/useAuth'
import { useCreateTeam } from '@/composables/useCreateTeam'

const { signOut } = useAuth()
const creating = useCreateTeam()
</script>

<template>
  <AppPage title="More" :back="false">
    <div class="screen">
      <IonList inset>
        <IonItem router-link="/equipment" detail lines="full"><IonLabel>My equipment</IonLabel></IonItem>
        <IonItem router-link="/join-team" detail lines="full"><IonLabel>Join another team</IonLabel></IonItem>
        <IonItem button detail lines="full" @click="creating.ask"><IonLabel>Create a team</IonLabel></IonItem>
        <IonItem router-link="/account" detail lines="full"><IonLabel>Account</IonLabel></IonItem>
        <IonItem router-link="/privacy" detail lines="full"><IonLabel>Your data</IonLabel></IonItem>
        <IonItem router-link="/settings" detail lines="none"><IonLabel>Settings</IonLabel></IonItem>
      </IonList>
      <ErrorText :message="creating.error.value" />
      <AppButton secondary @click="signOut">Sign out</AppButton>
    </div>
  </AppPage>
</template>
