<script setup lang="ts">
import { IonIcon } from '@ionic/vue'
import { arrowUndoOutline } from 'ionicons/icons'
import { useI18n } from 'vue-i18n'

import ErrorText from '@/components/ErrorText.vue'
import { COLOURS, type Tool } from '@/lib/drawing'

// The tools for drawing on a photo or a frame: line, angle, circle, five colours, undo, cancel and done.
defineProps<{ count: number; error: string | null; doneLabel: string }>()
const tool = defineModel<Tool>('tool', { required: true })
const colour = defineModel<string>('colour', { required: true })
const emit = defineEmits<{ undo: []; cancel: []; done: [] }>()

const { t } = useI18n()
const TOOLS: Tool[] = ['line', 'angle', 'circle']
const toolLabel = (x: Tool) => t(`media.tool.${x}`)
</script>

<template>
  <div class="toolbar">
    <ErrorText :message="error" />
    <div class="row">
      <button v-for="x in TOOLS" :key="x" type="button" class="tool" :class="{ on: tool === x }" @click="tool = x">{{ toolLabel(x) }}</button>
      <button type="button" :disabled="count === 0" :aria-label="$t('media.undo')" @click="emit('undo')"><IonIcon :icon="arrowUndoOutline" /></button>
    </div>
    <div class="row">
      <button v-for="c in COLOURS" :key="c" type="button" class="swatch" :class="{ on: colour === c }" :style="{ background: c }" :aria-label="c" @click="colour = c"></button>
    </div>
    <div class="row">
      <button type="button" class="text" @click="emit('cancel')">{{ $t('common.cancel') }}</button>
      <button type="button" class="text main-text" @click="emit('done')">{{ doneLabel }}</button>
    </div>
  </div>
</template>

<style scoped>
.toolbar {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-inline: 16px;
}
.toolbar .row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.toolbar button {
  min-width: 48px;
  height: 44px;
  border: 0;
  border-radius: 22px;
  background: color-mix(in srgb, currentcolor 10%, transparent);
  color: inherit;
  font-size: 1rem;
  font-weight: 600;
}
.toolbar .tool.on,
.toolbar .main-text {
  background: var(--ion-color-primary);
  color: var(--ion-color-primary-contrast);
}
.toolbar .swatch {
  min-width: 40px;
  height: 40px;
  border-radius: 20px;
  border: 2px solid color-mix(in srgb, currentcolor 30%, transparent);
}
.toolbar .swatch.on {
  border-color: var(--ion-color-primary);
  outline: 2px solid var(--ion-color-primary);
}
.toolbar .text {
  flex: 1;
}
</style>
