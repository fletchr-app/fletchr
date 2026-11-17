<script setup lang="ts">
import { IonIcon } from '@ionic/vue'
import { constructOutline, scanOutline } from 'ionicons/icons'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { COLOURS, type Mode } from '@/lib/drawing'

// Two round buttons in the top right corner of a picture while drawing: the colour (a menu of all colours) and the tools (a menu of
// line, angle, circle and move, then the skeleton). Meant to sit inside a `position: relative` box that has the picture.
defineProps<{ skeleton?: 'idle' | 'busy' }>()
const tool = defineModel<Mode>('tool', { required: true })
const colour = defineModel<string>('colour', { required: true })
const emit = defineEmits<{ skeleton: [] }>()

const { t } = useI18n()
const TOOLS: Mode[] = ['line', 'angle', 'circle', 'move']
const open = ref<'colour' | 'tools' | null>(null)
const toggle = (which: 'colour' | 'tools') => (open.value = open.value === which ? null : which)
function pickColour(c: string) {
  colour.value = c
  open.value = null
}
function pickTool(x: Mode) {
  tool.value = x
  open.value = null
}
function findSkeleton() {
  open.value = null
  emit('skeleton')
}
</script>

<template>
  <div class="drawing-menus" @pointerdown.stop>
    <div v-if="open" class="backdrop" @click="open = null"></div>
    <div class="slot">
      <button type="button" class="round bare" :aria-expanded="open === 'colour'" :aria-label="$t('media.colour')" @click="toggle('colour')">
        <span class="current" :style="{ background: colour }"></span>
      </button>
      <ul v-if="open === 'colour'" class="entries colours" role="menu">
        <li v-for="c in COLOURS" :key="c" role="none">
          <button type="button" role="menuitem" class="swatch" :class="{ on: colour === c }" :style="{ background: c }" :aria-label="c" @click="pickColour(c)"></button>
        </li>
      </ul>
    </div>
    <div class="slot">
      <button type="button" class="round" :aria-expanded="open === 'tools'" :aria-label="$t('media.tools')" @click="toggle('tools')">
        <IonIcon :icon="constructOutline" />
      </button>
      <ul v-if="open === 'tools'" class="entries" role="menu">
        <li v-for="x in TOOLS" :key="x" role="none">
          <button type="button" role="menuitem" :class="{ on: tool === x }" @click="pickTool(x)">{{ t(`media.tool.${x}`) }}</button>
        </li>
        <li v-if="skeleton" role="none">
          <button type="button" role="menuitem" class="sep" :disabled="skeleton === 'busy'" @click="findSkeleton()">
            <IonIcon :icon="scanOutline" />{{ skeleton === 'busy' ? $t('media.skeleton.finding') : $t('media.skeleton.find') }}
          </button>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.drawing-menus {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 3;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 10px;
}
.backdrop {
  position: fixed;
  inset: 0;
}
.slot {
  position: relative;
}
.round {
  position: relative;
  width: 48px;
  height: 48px;
  border: 0;
  border-radius: 50%;
  background: var(--ion-color-primary);
  color: var(--ion-color-primary-contrast);
  font-size: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgb(0 0 0 / 40%);
}
.round.bare {
  background: transparent;
  box-shadow: none;
}
.current {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 3px solid #fff;
  box-shadow: 0 0 3px rgb(0 0 0 / 60%);
}
.entries {
  position: absolute;
  top: 0;
  right: 56px;
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
.entries button:disabled {
  opacity: 0.4;
}
.entries button.on {
  color: var(--ion-color-primary);
  font-weight: 700;
}
.entries .sep {
  border-top: 1px solid rgb(255 255 255 / 20%);
  border-radius: 0;
}
.entries ion-icon {
  font-size: 22px;
}
.colours {
  display: flex;
  gap: 4px;
}
.colours .swatch {
  width: 40px;
  min-height: 40px;
  height: 40px;
  padding: 0;
  border-radius: 50%;
  border: 2px solid rgb(255 255 255 / 40%);
}
.colours .swatch.on {
  border-color: var(--ion-color-primary);
  outline: 2px solid var(--ion-color-primary);
}
</style>
