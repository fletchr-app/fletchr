<script setup lang="ts">
import { IonApp, IonIcon, IonLabel, IonRouterOutlet, IonTabBar, IonTabButton, IonTabs } from '@ionic/vue'
import { ellipsisHorizontal, home, listCircle, statsChart } from 'ionicons/icons'
import { computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { useAuth } from '@/composables/useAuth'

const route = useRoute()
const router = useRouter()
const { status } = useAuth()

// Signing in or out moves you to the right side of the app, wherever you were.
watch(status, (s) => {
  if (s === 'signedOut' && route.meta.auth === 'in') void router.replace('/sign-in')
  if (s === 'signedIn' && route.meta.auth === 'out') void router.replace('/')
})

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
        <IonTabButton tab="more" href="/more">
          <IonIcon :icon="ellipsisHorizontal" />
          <IonLabel>More</IonLabel>
        </IonTabButton>
      </IonTabBar>
    </IonTabs>
  </IonApp>
</template>
