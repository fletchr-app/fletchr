<script setup lang="ts">
import { alertController, IonButton, IonIcon, IonItem, IonList, IonListHeader, IonPopover } from '@ionic/vue'
import { checkmark, enterOutline, eyeOffOutline, eyeOutline, trashOutline } from 'ionicons/icons'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import type { Visibility } from '@/lib/log-model'

// What can be done with a photo or clip, as icons in the app bar of its full-screen view so the picture keeps the room:
// an eye (who sees it, in a small menu), an arrow into a training, a bin. Only what applies is shown.
const props = defineProps<{
  /** Part of the id of the eye button; the player and the viewer in the grid use different ones. */
  id: string
  /** Set when the clip is in no session and the person may choose who sees it. */
  visibility?: Visibility | null
  /** The clip is in a session, so it follows the session: the eye says so instead of offering the choice. */
  followsSession?: boolean
  /** Label of the move icon (into a training, or into another one); left out when the clip cannot be moved. */
  moveLabel?: string
  deletable?: boolean
  /** Notes on the clip, named in the question before it is deleted. */
  notes?: number
}>()
const emit = defineEmits<{ move: []; visibility: [Visibility]; delete: [] }>()

const { t } = useI18n()
const options = computed<{ value: Visibility; label: string }[]>(() => [
  { value: 'me', label: t('visibility.me') },
  { value: 'coaches', label: t('visibility.coaches') },
])
const showEye = computed(() => !!props.visibility || props.followsSession)

async function remove() {
  const alert = await alertController.create({
    header: t('media.deleteTitle'),
    message: (props.notes ?? 0) > 0 ? t('media.deleteMessageNotes') : t('media.deleteMessage'),
    buttons: [
      { text: t('common.cancel'), role: 'cancel' },
      { text: t('common.delete'), role: 'destructive', handler: () => emit('delete') },
    ],
  })
  await alert.present()
}
</script>

<template>
  <template v-if="showEye">
    <IonButton :id="`media-eye-${id}`" :aria-label="$t('visibility.clipLabel')">
      <IonIcon slot="icon-only" :icon="visibility === 'me' ? eyeOffOutline : eyeOutline" />
    </IonButton>
    <IonPopover :trigger="`media-eye-${id}`" dismiss-on-select>
      <IonList lines="none">
        <template v-if="visibility">
          <IonListHeader>{{ $t('visibility.clipLabel') }}</IonListHeader>
          <IonItem v-for="o in options" :key="o.value" button :detail="false" @click="emit('visibility', o.value)">
            {{ o.label }}
            <IonIcon v-if="visibility === o.value" slot="end" :icon="checkmark" />
          </IonItem>
        </template>
        <IonItem v-else :detail="false" class="ion-text-wrap">{{ $t('visibility.clipFollowsSession') }}</IonItem>
      </IonList>
    </IonPopover>
  </template>
  <IonButton v-if="moveLabel" :aria-label="moveLabel" @click="emit('move')"><IonIcon slot="icon-only" :icon="enterOutline" /></IonButton>
  <IonButton v-if="deletable" :aria-label="$t('media.delete')" @click="remove"><IonIcon slot="icon-only" :icon="trashOutline" /></IonButton>
</template>
