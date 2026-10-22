<script setup lang="ts">
import { IonButton, IonSpinner } from '@ionic/vue'

defineProps<{ busy?: boolean; secondary?: boolean }>()
</script>

<template>
  <IonButton expand="block" class="m-0" :fill="secondary ? 'outline' : 'solid'" :disabled="busy">
    <IonSpinner v-if="busy" name="crescent" />
    <slot v-else />
  </IonButton>
</template>
