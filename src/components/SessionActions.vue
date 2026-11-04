<script setup lang="ts">
import { alertController, IonButton, IonIcon, IonItem, IonList, IonPopover } from '@ionic/vue'
import { documentTextOutline, ellipsisVertical, imagesOutline } from 'ionicons/icons'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { type RouteLocationRaw, useRouter } from 'vue-router'

import { useLog } from '@/composables/useLog'
import { type LogSession, usesEnds } from '@/lib/log-model'

// The right of the app bar of a session: photos and notes as icons, the rest in a menu. What the menu offers depends on
// whether the session is still being shot (change the setup, all ends) or finished (reopen).
const props = defineProps<{ session: LogSession; mediaLink: RouteLocationRaw; canReopen?: boolean }>()
const emit = defineEmits<{ reopen: [] }>()

const { t } = useI18n()
const router = useRouter()
const { deleteSession } = useLog()
const id = computed(() => props.session.id)
const live = computed(() => !props.session.ended_at && usesEnds(props.session.type) && props.session.ends.length > 0)
// Sessions without ends (volume, technique) have their own button at the bottom.
const reopen = computed(() => !!props.session.ended_at && props.canReopen && usesEnds(props.session.type))

async function remove() {
  const alert = await alertController.create({
    header: t('session.delete'),
    message: t('session.deleteMessage'),
    buttons: [
      { text: t('common.cancel'), role: 'cancel' },
      {
        text: t('common.delete'),
        role: 'destructive',
        handler: () => {
          deleteSession(id.value)
          void router.replace('/training')
        },
      },
    ],
  })
  await alert.present()
}
</script>

<template>
  <IonButton :router-link="mediaLink" :aria-label="$t('media.link')"><IonIcon slot="icon-only" :icon="imagesOutline" /></IonButton>
  <IonButton :router-link="`/training/${id}/notes`" :aria-label="$t('notes.link')"><IonIcon slot="icon-only" :icon="documentTextOutline" /></IonButton>
  <IonButton :id="`session-menu-${id}`" :aria-label="$t('session.menu')"><IonIcon slot="icon-only" :icon="ellipsisVertical" /></IonButton>
  <IonPopover :trigger="`session-menu-${id}`" dismiss-on-select>
    <IonList lines="none">
      <IonItem v-if="reopen" button :detail="false" @click="emit('reopen')">{{ $t('session.reopenSession') }}</IonItem>
      <IonItem v-if="live" button :detail="false" :router-link="`/training/${id}/setup`">{{ session.owner ? $t('session.changeSetupArcher') : $t('session.changeSetup') }}</IonItem>
      <IonItem v-if="!session.owner" button :detail="false" :router-link="`/training/${id}/details`">{{ $t('details.link') }}</IonItem>
      <IonItem v-if="live" button :detail="false" :router-link="`/training/${id}/ends`">{{ $t('session.allEnds') }}</IonItem>
      <IonItem button :detail="false" @click="remove">{{ $t('session.delete') }}</IonItem>
    </IonList>
  </IonPopover>
</template>
