<script setup lang="ts">
import { IonContent, IonHeader, IonModal, IonTitle, IonToolbar } from '@ionic/vue'

import AppButton from '@/components/AppButton.vue'
import WhatsNewList from '@/components/WhatsNewList.vue'
import { useWhatsNew } from '@/composables/useWhatsNew'

// Shown once after the app was updated, with the changes since the version seen last. OK closes it for good.
const { pending, dismiss } = useWhatsNew()
</script>

<template>
  <IonModal :is-open="pending.length > 0" @did-dismiss="dismiss">
    <IonHeader>
      <IonToolbar>
        <IonTitle>{{ $t('whatsNew.title') }}</IonTitle>
      </IonToolbar>
    </IonHeader>
    <IonContent>
      <div class="screen">
        <WhatsNewList :entries="pending" />
        <AppButton @click="dismiss">{{ $t('whatsNew.ok') }}</AppButton>
      </div>
    </IonContent>
  </IonModal>
</template>
