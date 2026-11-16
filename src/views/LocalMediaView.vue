<script setup lang="ts">
import { IonButton, IonIcon } from '@ionic/vue'
import { createOutline, trashOutline } from 'ionicons/icons'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import AppPage from '@/components/AppPage.vue'
import DrawingLayer from '@/components/DrawingLayer.vue'
import DrawingToolbar from '@/components/DrawingToolbar.vue'
import LocalNoteText from '@/components/LocalNoteText.vue'
import NewNote from '@/components/NewNote.vue'
import { useAuth } from '@/composables/useAuth'
import { useMedia } from '@/composables/useMedia'
import { useNotes } from '@/composables/useNotes'
import { usePinchZoom } from '@/composables/usePinchZoom'
import { COLOURS, type Drawing, readDrawing, type Mode, type Shape } from '@/lib/drawing'
import { loadFiles, loadThumbnail } from '@/lib/media-files'

// A photo or video of someone without an account: shown from the file on the phone, with notes and, on a photo,
// drawings (lines, angles, circles). The frame-by-frame player and notes on a frame need the server (MediaPlayerView).
const route = useRoute()
const router = useRouter()
const id = route.params.id as string
const { userId } = useAuth()
const media = useMedia()
const notes = useNotes()
const archer = computed(() => Number(userId.value))

const item = computed(() => media.items.value.find((i) => i.id === id))
const url = ref<string | null>(null)
const poster = ref<string | null>(null)
const failed = ref(false)
watch(
  item,
  async (current) => {
    if (!current || url.value) return
    try {
      url.value = URL.createObjectURL((await loadFiles(current.id, current.kind === 'video' ? 'video/mp4' : 'image/jpeg')).file)
      if (current.kind === 'video') poster.value = URL.createObjectURL(await loadThumbnail(current.id))
    } catch {
      failed.value = true
    }
  },
  { immediate: true },
)
onBeforeUnmount(() => [url.value, poster.value].forEach((u) => u && URL.revokeObjectURL(u)))

const about = computed(() => notes.pendingFor({ archer: archer.value, media: id }))
const isPhoto = computed(() => item.value?.kind === 'photo')

// Drawing: a new drawing goes with the note that is written next; the drawing of a note that exists is changed in place.
const drawing = ref<{ shapes: Shape[]; noteUid: string | null } | null>(null)
const attached = ref<Shape[]>([])
const tool = ref<Mode>('line')
// Two fingers pinch and move the picture, also while drawing; one finger moves it when it is magnified and nothing is drawn.
const picture = ref<HTMLElement | null>(null)
const zoom = usePinchZoom(picture, () => !drawing.value, () => !(drawing.value && tool.value === 'angle')) // an angle is three taps: no double tap then
const colour = ref<string>(COLOURS[0])
const saved = computed(() => about.value.flatMap((n) => readDrawing(n.drawing).shapes))
const shown = computed(() => (drawing.value ? drawing.value.shapes : [...saved.value, ...attached.value]))
const forNewNote = computed(() => ({ mediaId: id, drawing: attached.value.length > 0 ? ({ v: 1, shapes: attached.value } satisfies Drawing) : null }))

function startDrawing(shapes: Shape[], noteUid: string | null) {
  drawing.value = { shapes: [...shapes], noteUid }
}
function finishDrawing() {
  const d = drawing.value!
  if (d.noteUid === null) attached.value = d.shapes
  else notes.edit(d.noteUid, { drawing: d.shapes.length > 0 ? { v: 1, shapes: d.shapes } : null })
  drawing.value = null
}

const confirmDelete = ref(false)
function remove() {
  if (!confirmDelete.value) return (confirmDelete.value = true)
  notes.removeAboutMedia(id)
  media.remove(id)
  void router.back()
}
</script>

<template>
  <AppPage :title="item ? new Date(item.taken_at).toLocaleString() : $t('media.title')" back-href="/media">
    <div v-if="!item" class="screen">{{ $t('media.empty') }}</div>
    <div v-else class="screen">
      <div v-if="failed" class="text-danger">{{ $t('media.fileLost') }}</div>
      <div class="stage" :style="{ aspectRatio: `${item.width} / ${item.height}` }" @pointerdown="zoom.down" @pointermove="zoom.move" @pointerup="zoom.up" @pointercancel="zoom.cancel">
        <button v-if="zoom.zoomed.value" type="button" class="unzoom" :aria-label="$t('media.unzoom')" @click="zoom.reset">1×</button>
        <video v-if="item.kind === 'video' && url" :src="url" :poster="poster ?? undefined" controls playsinline preload="metadata"></video>
        <div v-else-if="isPhoto && url" ref="picture" class="zoomable" :style="zoom.style.value">
          <img :src="url" alt="" />
          <DrawingLayer :shapes="shown" :width="item.width" :height="item.height" :editing="!!drawing" :tool="tool" :colour="colour" :scale="zoom.view.value.scale" @add="drawing?.shapes.push($event)" @change="(i, s) => drawing && (drawing.shapes[i] = s)" />
        </div>
      </div>
      <DrawingToolbar
        v-if="drawing"
        v-model:tool="tool"
        v-model:colour="colour"
        :count="drawing.shapes.length"
        :error="null"
        :done-label="drawing.noteUid === null ? $t('media.drawingDone') : $t('common.save')"
        @undo="drawing.shapes.pop()"
        @cancel="drawing = null"
        @done="finishDrawing"
      />
      <template v-else>
        <IonButton v-if="isPhoto" fill="outline" expand="block" class="m-0" @click="startDrawing(attached, null)"><IonIcon slot="start" :icon="createOutline" />{{ $t('media.drawPhoto') }}</IonButton>
        <div v-for="n in about" :key="n.uid" class="d-flex flex-column gap-1 py-1">
          <div class="muted">{{ new Date(n.created_at).toLocaleDateString() }}</div>
          <LocalNoteText :uid="n.uid" :body="n.body" :has-drawing="!!n.drawing">
            <IonButton v-if="isPhoto" fill="clear" size="small" class="m-0" @click="startDrawing(readDrawing(n.drawing).shapes, n.uid)">{{ $t('local.changeDrawing') }}</IonButton>
            <IonButton fill="clear" size="small" class="m-0" @click="notes.remove(n.uid)">{{ $t('local.deleteNote') }}</IonButton>
          </LocalNoteText>
        </div>
        <NewNote :archer-id="archer" :ends="[]" :teams="[]" :on="forNewNote" @added="attached = []" />
        <IonButton fill="clear" color="danger" class="m-0" @click="remove"><IonIcon slot="start" :icon="trashOutline" />{{ confirmDelete ? (about.length > 0 ? $t('media.deleteConfirmNotes') : $t('media.deleteConfirm')) : $t('media.delete') }}</IonButton>
      </template>
    </div>
  </AppPage>
</template>

<style scoped>
.stage {
  position: relative;
  width: min(100%, 70vh * v-bind('item ? item.width / item.height : 1'));
  align-self: center;
  background: #000;
  overflow: hidden; /* the magnified picture stays inside the stage */
  touch-action: none; /* the fingers are read as pointer events */
}
.unzoom {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 2;
  min-width: 44px;
  height: 36px;
  border: 0;
  border-radius: 18px;
  background: rgb(0 0 0 / 55%);
  color: #fff;
  font-weight: 600;
}
.zoomable {
  position: absolute;
  inset: 0;
  will-change: transform; /* one layer for the picture and its drawing, so a pinch or a drawn line does not paint it again at every step */
}
.stage img,
.stage video {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
}
</style>
