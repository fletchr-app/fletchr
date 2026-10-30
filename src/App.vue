<script setup lang="ts">
import { IonApp, IonIcon, IonLabel, IonRouterOutlet, IonTabBar, IonTabButton, IonTabs } from '@ionic/vue'
import { home, listCircle, people, settings, statsChart } from 'ionicons/icons'
import { App as CapacitorApp } from '@capacitor/app'
import { computed, onBeforeUnmount, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { useAuth } from '@/composables/useAuth'
import { useMediaLibrary } from '@/composables/useMediaLibrary'
import { useTeams } from '@/composables/useTeams'
import { codeFromUrl } from '@/lib/invite-link'

const route = useRoute()
const router = useRouter()
const { status } = useAuth()
const { isCoach } = useTeams()
useMediaLibrary() // starts keeping the list of your photos and videos on the phone

// Signing in or out moves you to the right side of the app, wherever you were.
watch(status, (s) => {
  if (s === 'signedOut' && route.meta.auth === 'in') void router.replace('/sign-in')
  if (s === 'signedIn' && route.meta.auth === 'out') void router.replace('/')
})

// An invite link opens the app on the right screen with the code filled in: signed in, you join; otherwise you register.
// While the app runs the link arrives as an event; when the link started the app, it has to be asked for.
let lastLink = ''
function openInvite(url: string | undefined) {
  const code = url ? codeFromUrl(url) : null
  if (!code || url === lastLink) return
  lastLink = url!
  void router.isReady().then(() => router.push({ path: status.value === 'signedIn' ? '/join-team' : '/register', query: { code } }))
}
const linkListener = CapacitorApp.addListener('appUrlOpen', ({ url }) => openInvite(url))
void CapacitorApp.getLaunchUrl().then((launch) => openInvite(launch?.url))
onBeforeUnmount(() => void linkListener.then((l) => l.remove()))

// The tab bar is for signed-in users.
const showTabs = computed(() => route.meta.tab === true && status.value === 'signedIn')
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
