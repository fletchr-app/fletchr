<script setup lang="ts">
import { IonIcon } from '@ionic/vue'
import { arrowUndoOutline, checkmark, close } from 'ionicons/icons'

import ErrorText from '@/components/ErrorText.vue'

// The bottom bar while drawing on a photo or a frame: undo, cancel (red) and done (green). Colour and tools are in DrawingMenus, over the picture.
defineProps<{ count: number; error: string | null; doneLabel: string }>()
const emit = defineEmits<{ undo: []; cancel: []; done: [] }>()
</script>

<template>
  <div class="toolbar" @pointerdown.stop>
    <div v-if="error" class="error"><ErrorText :message="error" /></div>
    <div class="row">
      <button type="button" :disabled="count === 0" :aria-label="$t('media.undo')" @click="emit('undo')"><IonIcon :icon="arrowUndoOutline" /></button>
      <button type="button" class="cancel" :aria-label="$t('common.cancel')" @click="emit('cancel')"><IonIcon :icon="close" /></button>
      <button type="button" class="done" :aria-label="doneLabel" @click="emit('done')"><IonIcon :icon="checkmark" /></button>
    </div>
  </div>
</template>

<style scoped>
/* Same corner and size as the round button of PictureMenu, so the buttons line up in every view. Over the lower right of the picture, so that the picture does not move. */
.toolbar {
  position: absolute;
  right: 24px;
  bottom: 28px;
  z-index: 3;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
}
.error {
  max-width: 70vw;
  padding: 4px 10px;
  border-radius: 8px;
  background: rgb(0 0 0 / 70%);
}
.toolbar .row {
  display: flex;
  align-items: center;
  gap: 28px;
}
.toolbar button {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: var(--ion-background-color, #000);
  color: var(--ion-text-color, #fff);
  border: 2px solid currentcolor;
  font-size: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgb(0 0 0 / 40%);
}
.toolbar button:disabled {
  opacity: 0.4;
}
.toolbar .cancel {
  color: #ff3b30;
}
.toolbar .done {
  color: #34c759;
}
</style>
