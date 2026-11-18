<script setup lang="ts">
import { IonIcon } from '@ionic/vue'
import { addOutline, brushOutline, chatbubbleOutline, documentTextOutline } from 'ionicons/icons'
import { ref } from 'vue'

// One round button in the corner of a picture; it opens a small menu with the entries draw, notes (the list) and add a note.
// Meant to sit inside a `position: relative` box that has the picture; touches on it are not read as swipe, pinch or drawing.
defineProps<{ drawLabel?: string; notesLabel?: string; addLabel?: string; notes: number }>()
const emit = defineEmits<{ draw: []; notes: []; add: [] }>()
const open = ref(false)
function pick(entry: 'draw' | 'notes' | 'add') {
  open.value = false
  if (entry === 'draw') emit('draw')
  else if (entry === 'notes') emit('notes')
  else emit('add')
}
</script>

<template>
  <div class="picture-menu" @pointerdown.stop>
    <div v-if="open" class="backdrop" @click="open = false"></div>
    <ul v-if="open" class="entries" role="menu">
      <li v-if="drawLabel" role="none">
        <button type="button" role="menuitem" @click="pick('draw')"><IonIcon :icon="brushOutline" />{{ drawLabel }}</button>
      </li>
      <li v-if="notesLabel" role="none">
        <button type="button" role="menuitem" @click="pick('notes')">
          <IonIcon :icon="chatbubbleOutline" />{{ notesLabel }}<span v-if="notes > 0" class="count">{{ notes }}</span>
        </button>
      </li>
      <li v-if="addLabel" role="none">
        <button type="button" role="menuitem" @click="pick('add')"><IonIcon :icon="addOutline" />{{ addLabel }}</button>
      </li>
    </ul>
    <button type="button" class="round" :aria-expanded="open" :aria-label="$t('media.actions')" @click="open = !open">
      <IonIcon :icon="documentTextOutline" />
      <span v-if="notes > 0 && !open" class="dot"></span>
    </button>
  </div>
</template>

<style scoped>
.picture-menu {
  position: absolute;
  right: 24px;
  bottom: 28px;
  z-index: 3;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
}
.backdrop {
  position: fixed;
  inset: 0;
}
.round {
  position: relative;
  width: 52px;
  height: 52px;
  border: 0;
  border-radius: 50%;
  background: var(--ion-color-primary);
  color: var(--ion-color-primary-contrast);
  font-size: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgb(0 0 0 / 40%);
}
.dot {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #ff3b30;
  border: 2px solid #000;
}
.entries {
  position: relative;
  margin: 0;
  padding: 4px;
  list-style: none;
  border-radius: 12px;
  background: rgb(30 30 30 / 95%);
  box-shadow: 0 2px 12px rgb(0 0 0 / 50%);
}
.entries button {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 44px;
  padding: 6px 14px;
  border: 0;
  background: transparent;
  color: #fff;
  font-size: 1rem;
  white-space: nowrap;
}
.entries ion-icon {
  font-size: 22px;
}
.count {
  min-width: 20px;
  padding: 0 6px;
  border-radius: 10px;
  background: var(--ion-color-primary);
  color: var(--ion-color-primary-contrast);
  font-size: 0.8rem;
  line-height: 20px;
  text-align: center;
}
</style>
