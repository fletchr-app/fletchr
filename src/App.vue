<script setup lang="ts">
import { IonApp, IonIcon, IonLabel, IonRouterOutlet, IonTabBar, IonTabButton, IonTabs } from '@ionic/vue'
import { home, listCircle, people, settings, statsChart } from 'ionicons/icons'
import { computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { useAppLinks } from '@/composables/useAppLinks'
import { useAuth } from '@/composables/useAuth'
import { useDeviceCalendar } from '@/composables/useDeviceCalendar'
import { useMediaLibrary } from '@/composables/useMediaLibrary'
import { useNoteLibrary } from '@/composables/useNoteLibrary'
import { usePushTaps } from '@/composables/usePush'
import { useTeams } from '@/composables/useTeams'

const route = useRoute()
const router = useRouter()
const { status } = useAuth()
const { isCoach } = useTeams()
useMediaLibrary() // starts keeping the list of your photos and videos on the phone
useNoteLibrary() // starts keeping your notes on the phone
useDeviceCalendar() // starts keeping the phone's calendar in step, when it is turned on

// Signing in or out moves you to the right side of the app, wherever you were.
watch(status, (s) => {
  if (s === 'signedOut' && (route.meta.auth === 'in' || route.meta.auth === 'account')) void router.replace('/sign-in')
  if (s === 'signedIn' && route.meta.auth === 'out') void router.replace('/')
})

useAppLinks() // invite and password reset links open the app on the right screen with the code filled in
usePushTaps() // a tap on a notification opens the screen it is about

// The tab bar is for signed-in users and for those who use the app without an account.
const showTabs = computed(() => route.meta.tab === true && (status.value === 'signedIn' || status.value === 'local'))
</script>

<template>
  <IonApp>
    <IonTabs>
      <IonRouterOutlet />
      <IonTabBar slot="bottom" :style="{ display: showTabs ? undefined : 'none' }">
        <IonTabButton tab="home" href="/">
          <IonIcon :icon="home" />
          <IonLabel>{{ $t('tabs.home') }}</IonLabel>
        </IonTabButton>
        <IonTabButton tab="training" href="/training">
          <IonIcon :icon="listCircle" />
          <IonLabel>{{ $t('tabs.training') }}</IonLabel>
        </IonTabButton>
        <IonTabButton tab="stats" href="/stats">
          <IonIcon :icon="statsChart" />
          <IonLabel>{{ $t('tabs.statistics') }}</IonLabel>
        </IonTabButton>
        <IonTabButton v-if="isCoach" tab="team" href="/team">
          <IonIcon :icon="people" />
          <IonLabel>{{ $t('tabs.team') }}</IonLabel>
        </IonTabButton>
        <IonTabButton tab="settings" href="/settings">
          <IonIcon :icon="settings" />
          <IonLabel>{{ $t('tabs.settings') }}</IonLabel>
        </IonTabButton>
      </IonTabBar>
    </IonTabs>
  </IonApp>
</template>
