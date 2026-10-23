<script setup lang="ts">
import { IonItem, IonLabel, IonList, IonListHeader } from '@ionic/vue'
import { computed, ref } from 'vue'

import AppButton from '@/components/AppButton.vue'
import AppPage from '@/components/AppPage.vue'
import ChipGroup from '@/components/ChipGroup.vue'
import ErrorText from '@/components/ErrorText.vue'
import FormField from '@/components/FormField.vue'
import { useAuth } from '@/composables/useAuth'
import { useCreateTeam } from '@/composables/useCreateTeam'
import { DEFAULT_SERVER_URL, useServer, useServerHealth } from '@/composables/useServer'
import { type ThemeMode, useTheme } from '@/composables/useTheme'

// The tab for everything that is not training: equipment, teams, account and data, and how the app looks and
// where it connects. Signed out (from the sign-in screen's "change" link) only the app part is shown.
const { status, signOut } = useAuth()
const signedIn = computed(() => status.value === 'signedIn')
const creating = useCreateTeam()

const { url, isOverride, setUrl } = useServer()
const health = useServerHealth()
const draft = ref(url.value)
const { mode, setMode } = useTheme()
const THEMES: { value: ThemeMode; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

function reset() {
  setUrl(null)
  draft.value = DEFAULT_SERVER_URL
}
</script>

<template>
  <AppPage title="Settings" :back="!signedIn" back-href="/sign-in">
    <div class="screen">
      <template v-if="signedIn">
        <IonList inset>
          <IonListHeader>Training</IonListHeader>
          <IonItem router-link="/equipment" detail lines="none"><IonLabel>My equipment</IonLabel></IonItem>
        </IonList>
        <IonList inset>
          <IonListHeader>Teams</IonListHeader>
          <IonItem router-link="/join-team" detail lines="full"><IonLabel>Join a team</IonLabel></IonItem>
          <IonItem button detail lines="none" @click="creating.ask"><IonLabel>Create a team</IonLabel></IonItem>
        </IonList>
        <ErrorText :message="creating.error.value" />
        <IonList inset>
          <IonListHeader>Account</IonListHeader>
          <IonItem router-link="/account" detail lines="full"><IonLabel>Name, email address, password</IonLabel></IonItem>
          <IonItem router-link="/privacy" detail lines="none"><IonLabel>Your data</IonLabel></IonItem>
        </IonList>
      </template>

      <h2 class="h5 mt-2 mb-0">App</h2>
      <ChipGroup :model-value="mode" label="Theme" :options="THEMES" @update:model-value="setMode" />
      <FormField v-model="draft" label="Server address" inputmode="url" :placeholder="DEFAULT_SERVER_URL" />
      <div class="muted">Default from build: {{ DEFAULT_SERVER_URL }}{{ isOverride ? ' (overridden on this device)' : '' }}</div>
      <div>Status: {{ health }}</div>
      <div class="d-flex gap-3">
        <AppButton @click="setUrl(draft)">Save</AppButton>
        <AppButton secondary @click="reset">Reset to default</AppButton>
      </div>

      <AppButton v-if="signedIn" class="mt-3" secondary @click="signOut">Sign out</AppButton>
    </div>
  </AppPage>
</template>
