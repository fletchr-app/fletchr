<script setup lang="ts">
import { IonToggle } from '@ionic/vue'

// "Coaches can see this session": on is `coaches`, off is `me`. Only the archer's own session on this device; the choice is saved with the
// rest of the screen. A session nobody chose for shows the archer's default from Settings.
const shared = defineModel<boolean>({ required: true })
</script>

<template>
  <div>
    <IonToggle :checked="shared" class="ion-text-wrap" @ion-change="shared = $event.detail.checked">{{ $t('visibility.sessionToggle') }}</IonToggle>
    <div class="faint">{{ $t('visibility.sessionHint') }}</div>
  </div>
</template>
