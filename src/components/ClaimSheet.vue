<script setup lang="ts">
import { IonButton, IonContent, IonItem, IonList, IonRadio, IonRadioGroup, modalController } from '@ionic/vue'
import { computed, ref } from 'vue'

import AppButton from '@/components/AppButton.vue'
import type { Decision } from '@/lib/claim-flow'
import type { LocalCounts } from '@/lib/local-claim'

// The one question when someone signs in or registers while the phone holds local data (#93). The share question has no
// preselection, and Upload stays off until it is answered.
const props = defineProps<{ email: string; counts: LocalCounts; videosWifiOnly: boolean }>()

const answer = ref<'yes' | 'no' | null>(null)
const KINDS = ['sessions', 'bows', 'arrowSets', 'photos', 'videos', 'notes'] as const
const lines = computed(() => KINDS.filter((k) => props.counts[k] > 0).map((k) => ({ kind: k, n: props.counts[k] })))

const close = (decision: Decision) => modalController.dismiss(decision, 'decision')
const upload = () => answer.value !== null && close({ kind: 'upload', share: answer.value === 'yes' })
</script>

<template>
  <IonContent>
    <div class="screen p-3">
      <h2 class="m-0">{{ $t('claim.title') }}</h2>
      <div>{{ $t('claim.intro', { email }) }}</div>
      <ul class="m-0">
        <li v-for="l in lines" :key="l.kind">{{ $t(`claim.counts.${l.kind}`, { n: l.n }, l.n) }}</li>
      </ul>
      <div v-if="counts.videos > 0" class="muted">{{ $t(videosWifiOnly ? 'claim.videosWifi' : 'claim.videosMobile') }}</div>
      <div class="fw-bold pt-2">{{ $t('claim.share') }}</div>
      <IonRadioGroup v-model="answer">
        <IonList lines="none">
          <IonItem><IonRadio value="yes" label-placement="end" justify="start">{{ $t('claim.shareYes') }}</IonRadio></IonItem>
          <IonItem><IonRadio value="no" label-placement="end" justify="start">{{ $t('claim.shareNo') }}</IonRadio></IonItem>
        </IonList>
      </IonRadioGroup>
      <div class="muted">{{ $t('claim.shareHint') }}</div>
      <IonButton expand="block" class="m-0" :disabled="answer === null" @click="upload">{{ $t('claim.upload') }}</IonButton>
      <AppButton secondary @click="close({ kind: 'keep' })">{{ $t('claim.keepLocal') }}</AppButton>
      <AppButton secondary @click="close({ kind: 'cancel' })">{{ $t('claim.cancel') }}</AppButton>
    </div>
  </IonContent>
</template>
