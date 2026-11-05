<script setup lang="ts">
import { IonBackButton, IonButtons, IonContent, IonHeader, IonPage, IonTitle, IonToolbar } from '@ionic/vue'

import BrandMark from '@/components/BrandMark.vue'
import ConnectionBanner from '@/components/ConnectionBanner.vue'

// One screen: app bar with back button and title, and the content below. `fixed` is for a screen
// that must not scroll (it sizes itself to the space it gets); `back` false for the tab screens. Those show the
// app's mark at the left of the bar, where the others have the back arrow (`mark` false: the screen draws its own).
// The `actions` slot is for icon buttons at the right of the bar.
withDefaults(defineProps<{ title: string; back?: boolean; backHref?: string; fixed?: boolean; mark?: boolean }>(), { back: true, backHref: '/', mark: undefined })
</script>

<template>
  <IonPage>
    <IonHeader>
      <IonToolbar>
        <IonBackButton v-if="back" slot="start" :default-href="backHref" text="" />
        <div v-else-if="mark ?? true" slot="start" class="mark"><BrandMark :size="28" /></div>
        <IonTitle>{{ title }}</IonTitle>
        <IonButtons v-if="$slots.actions" slot="end"><slot name="actions" /></IonButtons>
      </IonToolbar>
      <ConnectionBanner />
    </IonHeader>
    <IonContent :scroll-y="!fixed">
      <slot />
    </IonContent>
  </IonPage>
</template>

<style scoped>
.mark {
  display: flex;
  padding-inline: 16px 0;
}
</style>
