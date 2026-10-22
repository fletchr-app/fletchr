<script setup lang="ts">
import { IonBackButton, IonContent, IonHeader, IonPage, IonTitle, IonToolbar } from '@ionic/vue'

// One screen: app bar with back button and title, and the content below. `fixed` is for a screen
// that must not scroll (it sizes itself to the space it gets); `back` false for the tab screens.
withDefaults(defineProps<{ title: string; back?: boolean; backHref?: string; fixed?: boolean }>(), { back: true, backHref: '/' })
</script>

<template>
  <IonPage>
    <IonHeader>
      <IonToolbar>
        <template v-if="back">
          <IonBackButton slot="start" :default-href="backHref" text="" />
        </template>
        <IonTitle>{{ title }}</IonTitle>
      </IonToolbar>
    </IonHeader>
    <IonContent :scroll-y="!fixed">
      <slot />
    </IonContent>
  </IonPage>
</template>
