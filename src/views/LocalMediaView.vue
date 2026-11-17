<script setup lang="ts">
import { IonButton, IonIcon, IonModal } from '@ionic/vue'
import { brushOutline, trashOutline } from 'ionicons/icons'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import AppPage from '@/components/AppPage.vue'
import DrawingLayer from '@/components/DrawingLayer.vue'
import DrawingToolbar from '@/components/DrawingToolbar.vue'
import LocalNoteText from '@/components/LocalNoteText.vue'
import NewNote from '@/components/NewNote.vue'
import PictureMenu from '@/components/PictureMenu.vue'
import { useAuth } from '@/composables/useAuth'
import { useMedia } from '@/composables/useMedia'
import { useNotes } from '@/composables/useNotes'
import { usePinchZoom } from '@/composables/usePinchZoom'
import { COLOURS, type Drawing, loupeStyle, readDrawing, type Mode, type Shape } from '@/lib/drawing'
import { loadFiles, loadThumbnail } from '@/lib/media-files'
import { swipeStep } from '@/lib/player'

// A photo or video of someone without an account: shown from the file on the phone, with notes and, on a photo,
// drawings (lines, angles, circles). The frame-by-frame player and notes on a frame need the server (MediaPlayerView).
const route = useRoute()
const router = useRouter()
const id = ref(route.params.id as string) // the picture on show; a swipe or a button changes it without leaving the screen
const { userId } = useAuth()
const media = useMedia()
const notes = useNotes()
const archer = computed(() => Number(userId.value))

const item = computed(() => media.items.value.find((i) => i.id === id.value))
const url = ref<string | null>(null)
const poster = ref<string | null>(null)
const failed = ref(false)
// Another picture: forget the files, the zoom and what was being drawn of the one before.
watch(id, () => {
  ;[url.value, poster.value].forEach((u) => u && URL.revokeObjectURL(u))
  url.value = null
  poster.value = null
  failed.value = false
  zoom.reset()
  drawing.value = null
  attached.value = []
  confirmDelete.value = false
})
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

const about = computed(() => notes.pendingFor({ archer: archer.value, media: id.value }))
const isPhoto = computed(() => item.value?.kind === 'photo')

// Drawing: a new drawing goes with the note that is written next; the drawing of a note that exists is changed in place.
const drawing = ref<{ shapes: Shape[]; noteUid: string | null } | null>(null)
const attached = ref<Shape[]>([])
const tool = ref<Mode>('line')
// Two fingers pinch and move the picture, also while drawing; one finger moves it when it is magnified and nothing is drawn.
const picture = ref<HTMLElement | null>(null)
const zoom = usePinchZoom(picture, () => !drawing.value, () => !(drawing.value && tool.value === 'angle')) // an angle is three taps: no double tap then
const colour = ref<string>(COLOURS[0])
const notesOpen = ref(false) // the list of the notes
const addOpen = ref(false) // the form for a new note
const saved = computed(() => about.value.flatMap((n) => readDrawing(n.drawing).shapes))
const shown = computed(() => (drawing.value ? drawing.value.shapes : [...saved.value, ...attached.value]))
// While drawing, the drawings of the other notes stay on the picture (not the one of the note that is being changed).
const backdrop = computed(() => (drawing.value ? about.value.filter((n) => n.uid !== drawing.value!.noteUid).flatMap((n) => readDrawing(n.drawing).shapes) : []))
const forNewNote = computed(() => ({ mediaId: id.value, drawing: attached.value.length > 0 ? ({ v: 1, shapes: attached.value } satisfies Drawing) : null }))

function startDrawing(shapes: Shape[], noteUid: string | null) {
  drawing.value = { shapes: [...shapes], noteUid }
}
function finishDrawing() {
  const d = drawing.value!
  if (d.noteUid === null) {
    attached.value = d.shapes
    addOpen.value = true // the note that goes with the drawing
  } else notes.edit(d.noteUid, { drawing: d.shapes.length > 0 ? { v: 1, shapes: d.shapes } : null })
  drawing.value = null
}

// The photos and clips on the phone in the order of the media screen: a swipe on a photo goes through them.
const order = computed(() => media.items.value.map((i) => ({ id: i.id, kind: i.kind })))
const place = computed(() => order.value.findIndex((i) => i.id === id.value))
const hasPrevious = computed(() => place.value > 0)
const hasNext = computed(() => place.value >= 0 && place.value < order.value.length - 1)
const stage = ref<HTMLElement | null>(null)
// While a finger draws, the layer says where the drawn point is: the whole picture is magnified around it (LOUPE) until the finger is up.
const loupeAt = ref<{ x: number; y: number } | null>(null)
function onLoupe(at: { x: number; y: number } | null) {
  const box = stage.value?.getBoundingClientRect()
  loupeAt.value = at && box ? { x: at.x - box.left, y: at.y - box.top } : null
}
let sliding = false
// The picture slides out, the next one slides in (not with reduced motion).
async function goTo(delta: 1 | -1) {
  const next = order.value[place.value + delta]
  const el = stage.value
  if (!next || sliding) return
  if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return void (id.value = next.id)
  sliding = true
  const width = el.clientWidth
  try {
    const out = el.animate([{ transform: 'translateX(0)', opacity: 1 }, { transform: `translateX(${-delta * width * 0.5}px)`, opacity: 0 }], { duration: 120, easing: 'ease-in', fill: 'forwards' })
    await out.finished.catch(() => undefined)
    id.value = next.id
    out.cancel()
    stage.value?.animate([{ transform: `translateX(${delta * width * 0.5}px)`, opacity: 0 }, { transform: 'translateX(0)', opacity: 1 }], { duration: 160, easing: 'ease-out' })
  } finally {
    sliding = false
  }
}
let swipe: { x: number; y: number; at: number } | null = null
function stageDown(e: PointerEvent) {
  zoom.down(e)
  swipe = zoom.fingers() > 1 || drawing.value || zoom.zoomed.value || item.value?.kind !== 'photo' || e.clientX < 24 || e.clientX > window.innerWidth - 24 ? null : { x: e.clientX, y: e.clientY, at: performance.now() }
}
function stageUp(e: PointerEvent) {
  const s = swipe
  swipe = null
  if (s && !drawing.value && !zoom.zoomed.value && zoom.fingers() <= 1) {
    const direction = swipeStep(e.clientX - s.x, e.clientY - s.y, performance.now() - s.at)
    if ((direction === 1 && hasNext.value) || (direction === -1 && hasPrevious.value)) void goTo(direction)
  }
  zoom.up(e)
}
function stageCancel(e: PointerEvent) {
  swipe = null
  zoom.cancel(e)
}

const confirmDelete = ref(false)
function remove() {
  if (!confirmDelete.value) return (confirmDelete.value = true)
  notes.removeAboutMedia(id.value)
  media.remove(id.value)
  void router.back()
}
</script>

<template>
  <AppPage :title="item ? new Date(item.taken_at).toLocaleString() : $t('media.title')" back-href="/media">
    <div v-if="!item" class="screen">{{ $t('media.empty') }}</div>
    <div v-else class="screen">
      <div v-if="failed" class="text-danger">{{ $t('media.fileLost') }}</div>
      <div ref="stage" class="stage" :style="{ aspectRatio: `${item.width} / ${item.height}` }" @pointerdown="stageDown" @pointermove="zoom.move" @pointerup="stageUp" @pointercancel="stageCancel">
        <button v-if="zoom.zoomed.value" type="button" class="unzoom" :aria-label="$t('media.unzoom')" @click="zoom.reset">1×</button>
        <video v-if="item.kind === 'video' && url" :src="url" :poster="poster ?? undefined" controls playsinline preload="metadata"></video>
        <div v-else-if="isPhoto && url" class="loupe" :class="{ on: !!loupeAt }" :style="loupeStyle(loupeAt)">
          <div ref="picture" class="zoomable" :style="zoom.style.value">
            <img :src="url" alt="" />
            <DrawingLayer :shapes="shown" :backdrop="backdrop" :width="item.width" :height="item.height" :editing="!!drawing" :tool="tool" :colour="colour" :scale="zoom.view.value.scale" @add="drawing?.shapes.push($event)" @change="(i, s) => drawing && (drawing.shapes[i] = s)" @loupe="onLoupe" />
          </div>
        </div>
        <PictureMenu v-if="!drawing" :draw-label="isPhoto ? $t('media.drawPhoto') : undefined" :notes-label="about.length > 0 ? $t('media.notesTitle') : undefined" :add-label="$t('media.addNote')" :notes="about.length" @draw="startDrawing(attached, null)" @notes="notesOpen = true" @add="addOpen = true" />
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
        <IonButton fill="clear" color="danger" class="m-0" @click="remove"><IonIcon slot="start" :icon="trashOutline" />{{ confirmDelete ? (about.length > 0 ? $t('media.deleteConfirmNotes') : $t('media.deleteConfirm')) : $t('media.delete') }}</IonButton>
      </template>
    </div>
    <IonModal :is-open="notesOpen" :initial-breakpoint="0.7" :breakpoints="[0, 0.7, 1]" @did-dismiss="notesOpen = false">
      <div class="screen sheet">
        <h2 class="h5 m-0">{{ $t('media.notesTitle') }}</h2>
        <div v-if="about.length === 0" class="muted">{{ isPhoto ? $t('media.noNotesPhoto') : $t('media.noNotes') }}</div>
        <div v-for="n in about" :key="n.uid" class="d-flex flex-column gap-1 py-1">
          <div class="muted">{{ new Date(n.created_at).toLocaleDateString() }}</div>
          <LocalNoteText :uid="n.uid" :body="n.body" :has-drawing="!!n.drawing" icons>
            <IonButton v-if="isPhoto" fill="clear" size="small" class="m-0" :aria-label="$t('local.changeDrawing')" @click="notesOpen = false; startDrawing(readDrawing(n.drawing).shapes, n.uid)"><IonIcon slot="icon-only" :icon="brushOutline" /></IonButton>
            <IonButton fill="clear" size="small" class="m-0" :aria-label="$t('local.deleteNote')" @click="notes.remove(n.uid)"><IonIcon slot="icon-only" :icon="trashOutline" /></IonButton>
          </LocalNoteText>
        </div>
      </div>
    </IonModal>
    <IonModal :is-open="addOpen" :initial-breakpoint="0.27" :breakpoints="[0, 0.27, 1]" @did-dismiss="addOpen = false">
      <div class="screen sheet">
        <h2 class="h5 m-0">{{ $t('media.addNote') }}</h2>
        <div v-if="attached.length > 0" class="d-flex align-items-center justify-content-between gap-2">
          <span>{{ $t('media.drawingAttached', { n: attached.length }) }}</span>
          <IonButton fill="clear" size="small" class="m-0" @click="attached = []">{{ $t('media.drawingRemove') }}</IonButton>
        </div>
        <NewNote :archer-id="archer" :ends="[]" :teams="[]" :on="forNewNote" @added="attached = []; addOpen = false" />
      </div>
    </IonModal>
  </AppPage>
</template>

<style scoped>
.sheet {
  overflow-y: auto;
  height: 100%;
  width: 100%; /* a short sheet must not shrink to its content */
}
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
.loupe {
  position: absolute;
  inset: 0;
}
.loupe.on {
  will-change: transform;
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
