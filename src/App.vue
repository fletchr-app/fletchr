<script setup lang="ts">
import { IonApp, IonIcon, IonLabel, IonRouterOutlet, IonTabBar, IonTabButton, IonTabs } from '@ionic/vue'
import { ellipsisHorizontal, home, listCircle, people, statsChart } from 'ionicons/icons'
import { App as CapacitorApp } from '@capacitor/app'
import { computed, onBeforeUnmount, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { useAuth } from '@/composables/useAuth'
import { useTeams } from '@/composables/useTeams'
import { codeFromUrl } from '@/lib/invite-link'

const route = useRoute()
const router = useRouter()
const { status } = useAuth()
const { isCoach } = useTeams()

// Signing in or out moves you to the right side of the app, wherever you were.
watch(status, (s) => {
  if (s === 'signedOut' && route.meta.auth === 'in') void router.replace('/sign-in')
  if (s === 'signedIn' && route.meta.auth === 'out') void router.replace('/')
})

// An invite link opens the app on the right screen with the code filled in: signed in, you join; otherwise you register.
const linkListener = CapacitorApp.addListener('appUrlOpen', ({ url }) => {
  const code = codeFromUrl(url)
  if (code) void router.push({ path: status.value === 'signedIn' ? '/join-team' : '/register', query: { code } })
})
onBeforeUnmount(() => void linkListener.then((l) => l.remove()))

const showTabs = computed(() => route.meta.tab === true)
</script>

<template>
  <IonApp>
    <IonTabs>
      <IonRouterOutlet />
      <IonTabBar slot="bottom" :style="{ display: showTabs ? undefined : 'none' }">
        <IonTabButton tab="home" href="/">
          <IonIcon :icon="home" />
          <IonLabel>Home</IonLabel>
        </IonTabButton>
        <IonTabButton tab="training" href="/training">
          <IonIcon :icon="listCircle" />
          <IonLabel>Training</IonLabel>
        </IonTabButton>
        <IonTabButton tab="stats" href="/stats">
          <IonIcon :icon="statsChart" />
          <IonLabel>Statistics</IonLabel>
        </IonTabButton>
        <IonTabButton v-if="isCoach" tab="team" href="/team">
          <IonIcon :icon="people" />
          <IonLabel>Team</IonLabel>
        </IonTabButton>
        <IonTabButton tab="more" href="/more">
          <IonIcon :icon="ellipsisHorizontal" />
          <IonLabel>More</IonLabel>
        </IonTabButton>
      </IonTabBar>
    </IonTabs>
  </IonApp>
</template>
