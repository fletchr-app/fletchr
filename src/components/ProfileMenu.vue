<script setup lang="ts">
import { IonButton, IonIcon, IonItem, IonList, IonPopover } from '@ionic/vue'
import { ellipsisVertical } from 'ionicons/icons'

// The right of the app bar on the start page: the picture and the details of your profile. Both need an account, so the screen leaves it out without one.
defineProps<{ avatarUrl: string; avatarAllowed: boolean }>()
const emit = defineEmits<{ picture: [] }>()
</script>

<template>
  <IonButton id="profile-menu" :aria-label="$t('archer.menu')"><IonIcon slot="icon-only" :icon="ellipsisVertical" /></IonButton>
  <IonPopover trigger="profile-menu" dismiss-on-select>
    <IonList lines="none">
      <IonItem v-if="avatarAllowed" button :detail="false" @click="emit('picture')">{{ avatarUrl ? $t('avatar.change') : $t('avatar.add') }}</IonItem>
      <IonItem button :detail="false" router-link="/profile">{{ $t('archer.editDetails') }}</IonItem>
    </IonList>
  </IonPopover>
</template>
