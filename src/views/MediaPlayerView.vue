<script setup lang="ts">
import { IonIcon, IonModal } from '@ionic/vue'
import { arrowUndoOutline, chatbubbleOutline, chevronBack, chevronForward, pause, play, playSkipBack, playSkipForward, createOutline, trashOutline } from 'ionicons/icons'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import AppPage from '@/components/AppPage.vue'
import DrawingLayer from '@/components/DrawingLayer.vue'
import ErrorText from '@/components/ErrorText.vue'
import NewNote from '@/components/NewNote.vue'
import NoteRow from '@/components/NoteRow.vue'
import { useAuth } from '@/composables/useAuth'
import { useEvaluationDraft } from '@/composables/useEvaluationDraft'
import { useRemote } from '@/composables/useRemote'
import { COLOURS, type Drawing, fitted, readDrawing, type Shape, type Tool } from '@/lib/drawing'
import { errorMessage } from '@/lib/errors'
import { FrameDecoder } from '@/lib/frame-decoder'
import { clock, frameAt, frameRate, nextSpeed, scrubbed, seekTime, speedLabel, stepped, totalFrames } from '@/lib/player'

// One uploaded clip, to look at frame by frame: the video above, a tape below it that is dragged sideways (one
// tick is one frame), and the controls. The clips of the same session or archer are one tap away.
const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const { api } = useAuth()

const PX_PER_FRAME = 12
// Opened from an evaluation to choose the frame that shows a criterion: "Use this frame" goes back to the form.
const frameDraft = useEvaluationDraft()
const choosing = computed(() => !!route.query.pick && !!frameDraft.picking.value)
function useFrame() {
  halt()
  const back = frameDraft.finishPick(currentId.value, frame.value, Math.round((frame.value / fps.value) * 1000))
  if (back) void router.push(back)
}
// Opened with ?frame=: start at that frame (a link from an evaluation).
let startFrame = route.query.frame !== undefined ? Number(route.query.frame) : null
const currentId = ref(route.params.id as string)
const siblings = ref<string[]>([])

const { data: clip, error, reload } = useRemote(
  async () => {
    const { data } = await api.GET('/api/media/{media_id}/', { params: { path: { media_id: currentId.value } } })
    return data ?? null
  },
  { watch: [currentId] },
)

// The other clips of the same session or archer, in the order of the grid.
onMounted(async () => {
  const session = route.query.session as string | undefined
  const owner = route.query.owner ? Number(route.query.owner) : undefined
  if (!session && owner === undefined) return
  const { data } = await api.GET('/api/media/', { params: { query: session ? { session } : { owner } } }).catch(() => ({ data: null }))
  siblings.value = (data ?? []).filter((m) => m.kind === 'video').map((m) => m.id)
})
const index = computed(() => siblings.value.indexOf(currentId.value))
const hasPrevious = computed(() => index.value > 0)
const hasNext = computed(() => index.value >= 0 && index.value < siblings.value.length - 1)
function goTo(delta: number) {
  halt()
  currentId.value = siblings.value[index.value + delta]!
  pos.value = 0
}

// Coach notes on single frames: the tape shows where they are, a tap on a note jumps to its frame.
const notes = useRemote(
  async () => (await api.GET('/api/notes/', { params: { query: { media: currentId.value } } })).data ?? null,
  { watch: [currentId] },
)
const teams = useRemote(
  async () => (clip.value ? ((await api.GET('/api/notes/teams/', { params: { query: { archer: clip.value.owner } } })).data ?? null) : null),
  { watch: [clip] },
)
const frameNotes = computed(() =>
  (notes.data.value ?? []).filter((n) => n.frame !== null && n.frame !== undefined).sort((a, b) => a.frame! - b.frame! || a.created_at.localeCompare(b.created_at)),
)
const noteHere = computed(() => frameNotes.value.find((n) => n.frame === frame.value))
const notesOpen = ref(false)
function jump(f: number) {
  notesOpen.value = false
  halt()
  show(Math.min(f, total.value - 1))
}

// Drawing on a frame: lines, angles, circles. A new drawing is attached to the note that is written next; the drawing
// of a note that exists is changed in place.
const canDraw = computed(() => clip.value?.kind === 'video' && !!teams.data.value?.length)
const drawing = ref<{ shapes: Shape[]; noteId: number | null } | null>(null)
const attached = ref<Shape[]>([]) // drawn, not yet saved with a note
const tool = ref<Tool>('line')
const colour = ref<string>(COLOURS[0])
const drawError = ref<string | null>(null)
const TOOLS: Tool[] = ['line', 'angle', 'circle']
const toolLabel = (x: Tool) => t(`media.tool.${x}`)
function startDrawing(shapes: Shape[], noteId: number | null) {
  halt()
  notesOpen.value = false
  drawError.value = null
  drawing.value = { shapes: [...shapes], noteId }
}
function undo() {
  drawing.value?.shapes.pop()
}
function cancelDrawing() {
  drawing.value = null
}
async function finishDrawing() {
  const d = drawing.value!
  if (d.noteId === null) {
    attached.value = d.shapes
    drawing.value = null
    notesOpen.value = true // the note that goes with the drawing
    return
  }
  const body = { drawing: d.shapes.length > 0 ? ({ v: 1, shapes: d.shapes } satisfies Drawing) : null }
  try {
    const { data, error: failure } = await api.PATCH('/api/notes/{id}/', { params: { path: { id: d.noteId } }, body })
    if (!data) return void (drawError.value = errorMessage(failure))
  } catch {
    return void (drawError.value = t('common.serverNotReachable'))
  }
  drawing.value = null
  notes.reload()
}
function editDrawing(note: { id: number; frame?: number | null; drawing?: unknown }) {
  if (note.frame !== null && note.frame !== undefined) show(Math.min(note.frame, total.value - 1))
  startDrawing(readDrawing(note.drawing).shapes, note.id)
}
const savedHere = computed(() => frameNotes.value.filter((n) => n.frame === frame.value).flatMap((n) => readDrawing(n.drawing).shapes))
const shownShapes = computed(() => (drawing.value ? drawing.value.shapes : [...savedHere.value, ...attached.value]))
// The picture is shown whole in the stage; the drawing layer has exactly its shape.
const stage = ref<HTMLElement | null>(null)
const stageBox = ref({ width: 0, height: 0 })
const pictureSize = ref({ width: 0, height: 0 }) // the picture as the video has it, once known
let stageWatch: ResizeObserver | null = null
watch(stage, (el) => {
  stageWatch?.disconnect()
  if (!el) return
  const measureStage = () => (stageBox.value = { width: el.clientWidth, height: el.clientHeight })
  measureStage()
  stageWatch = new ResizeObserver(measureStage)
  stageWatch.observe(el)
})
onBeforeUnmount(() => stageWatch?.disconnect())
const shape = computed(() => (pictureSize.value.width > 0 ? pictureSize.value : { width: clip.value?.width ?? 16, height: clip.value?.height ?? 9 }))
const pictureBox = computed(() => {
  const fit = fitted(stageBox.value, shape.value.width / shape.value.height)
  return { width: `${fit.width}px`, height: `${fit.height}px` }
})

const video = ref<HTMLVideoElement | null>(null)
const duration = ref(0)
const fps = computed(() => (clip.value ? frameRate(clip.value) : 30))
const decodedFrames = ref(0) // the number of frames in the file, once the decoder has read it
const total = computed(() => decodedFrames.value || totalFrames(duration.value || (clip.value?.duration_ms ?? 0) / 1000, fps.value))
const pos = ref(0) // in frames; a fraction while the tape is being dragged
const frame = computed(() => Math.round(pos.value))
const playing = ref(false)
const speed = ref(1)

function loaded() {
  if (video.value!.videoWidth) pictureSize.value = { width: video.value!.videoWidth, height: video.value!.videoHeight }
  duration.value = video.value!.duration
  video.value!.playbackRate = speed.value
  if (startFrame !== null) {
    show(Math.max(0, Math.min(startFrame, total.value - 1)))
    startFrame = null
  }
}

// One seek at a time: a seek to a frame between two keyframes decodes from the keyframe before it, so a fast drag that
// asked for every frame piled up work and the picture stalled. While one is under way only the latest wish is kept.
let wanted: number | null = null
function seekTo(f: number) {
  wanted = f
  if (!video.value?.seeking) seekNow()
}
function seekNow() {
  const el = video.value
  if (!el || wanted === null) return
  el.currentTime = seekTime(wanted, fps.value, duration.value)
  wanted = null
}
function show(f: number) {
  pos.value = f
  if (decoder) decoder.show(f)
  else seekTo(f)
}

// The clip is fetched once into memory: the <video> plays it from there, and the decoder takes single frames out of it
// while the tape is dragged. The canvas covers the video as soon as the first frame is ready.
const videoUrl = ref<string | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const canvasOn = ref(false)
const loadError = ref<string | null>(null)
let decoder: FrameDecoder | null = null
let loadNumber = 0

function release() {
  loadNumber++
  decoder?.close()
  decoder = null
  decodedFrames.value = 0
  pictureSize.value = { width: 0, height: 0 }
  attached.value = []
  drawing.value = null
  canvasOn.value = false
  if (videoUrl.value) URL.revokeObjectURL(videoUrl.value)
  videoUrl.value = null
}

function draw(_frame: number, picture: ImageBitmap) {
  const c = canvas.value
  if (!c || !decoder) return
  if (c.width !== decoder.width || c.height !== decoder.height) {
    c.width = decoder.width
    c.height = decoder.height
  }
  pictureSize.value = { width: decoder.width, height: decoder.height }
  const context = c.getContext('2d')!
  context.setTransform(...decoder.transform)
  context.drawImage(picture, 0, 0)
  canvasOn.value = true
}

async function load(url: string) {
  const mine = ++loadNumber
  try {
    const response = await fetch(url)
    if (!response.ok) throw new Error(String(response.status))
    const data = await response.arrayBuffer()
    if (mine !== loadNumber) return
    videoUrl.value = URL.createObjectURL(new Blob([data], { type: 'video/mp4' }))
    const opened = await FrameDecoder.open(data, draw, dropDecoder)
    if (mine !== loadNumber) return opened?.close()
    decoder = opened
    decodedFrames.value = opened?.frames ?? 0
  } catch {
    if (mine === loadNumber) failed()
  }
}

// If the decoder gives up, the video element does the scrubbing, as it does where there is no decoder at all.
function dropDecoder() {
  decoder?.close()
  decoder = null
  decodedFrames.value = 0
  canvasOn.value = false
  if (video.value) show(frame.value)
}

watch(
  () => (clip.value?.kind === 'video' ? clip.value.file_url : null),
  (url) => {
    release()
    if (url) void load(url)
  },
  { immediate: true },
)
onBeforeUnmount(release)

/** Brings the video to the frame the canvas shows, so that it plays on from there. */
function syncVideo(f: number): Promise<void> {
  const el = video.value
  const to = seekTime(f, fps.value, duration.value)
  if (!el || Math.abs(el.currentTime - to) < 1e-4) return Promise.resolve()
  return new Promise((resolve) => {
    const done = () => (clearTimeout(timer), resolve())
    const timer = setTimeout(done, 500)
    el.addEventListener('seeked', done, { once: true })
    el.currentTime = to
  })
}

// While it plays, the tape follows the picture.
let raf = 0
function follow() {
  const el = video.value
  if (el) pos.value = Math.min(total.value - 1, Math.max(0, el.currentTime * fps.value - 0.5)) // the middle of a frame is its number
  raf = requestAnimationFrame(follow)
}
function started() {
  playing.value = true
  cancelAnimationFrame(raf)
  raf = requestAnimationFrame(follow)
}
function stopped() {
  playing.value = false
  cancelAnimationFrame(raf)
}
/** Pauses and takes the position from the video, before something else (a step, a drag) moves it. */
function halt() {
  const el = video.value
  if (!el || el.paused) return
  el.pause()
  stopped()
  pos.value = frameAt(el.currentTime, fps.value, total.value)
}
function ended() {
  stopped()
  pos.value = total.value - 1
}
onBeforeUnmount(() => cancelAnimationFrame(raf))

async function toggle() {
  const el = video.value
  if (!el) return
  if (playing.value) return halt()
  if (frame.value >= total.value - 1) pos.value = 0
  if (canvasOn.value) {
    await syncVideo(frame.value)
    canvasOn.value = false
  } else if (frame.value === 0) await syncVideo(0)
  void el.play().catch(() => undefined)
}
function step(delta: number) {
  halt()
  show(stepped(pos.value, delta, total.value))
}
function cycleSpeed() {
  speed.value = nextSpeed(speed.value)
  if (video.value) video.value.playbackRate = speed.value
}

// The tape.
const tape = ref<HTMLElement | null>(null)
const tapeWidth = ref(0)
let measure: ResizeObserver | null = null
// The tape exists once the clip has loaded.
watch(tape, (el) => {
  measure?.disconnect()
  if (!el) return
  tapeWidth.value = el.clientWidth
  measure = new ResizeObserver(() => (tapeWidth.value = el.clientWidth))
  measure.observe(el)
})
onBeforeUnmount(() => measure?.disconnect())
const ticksStyle = computed(() => ({
  width: `${total.value * PX_PER_FRAME + 2}px`,
  transform: `translateX(${tapeWidth.value / 2 - pos.value * PX_PER_FRAME}px)`,
}))

let drag: { x: number; pos: number } | null = null
function down(e: PointerEvent) {
  halt()
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  drag = { x: e.clientX, pos: pos.value }
}
function move(e: PointerEvent) {
  if (!drag) return
  const to = scrubbed(drag.pos, e.clientX - drag.x, PX_PER_FRAME, total.value)
  const changed = Math.round(to) !== frame.value
  pos.value = to
  if (changed) show(Math.round(to))
}
function up() {
  if (!drag) return
  drag = null
  pos.value = frame.value
}
function slide(e: Event) {
  halt()
  show(Number((e.target as HTMLInputElement).value))
}

// The link to the file stops working after an hour: ask for a new one once if the clip does not load.
let renewed = false
function failed() {
  if (renewed) return (loadError.value = t('common.couldNotLoad'))
  renewed = true
  reload()
}
watch(currentId, () => {
  renewed = false
  loadError.value = null
})

const title = computed(() => (clip.value ? new Date(clip.value.taken_at).toLocaleString() : ''))
const confirmDelete = ref(false)
const deleteError = ref<string | null>(null)
async function remove() {
  if (!confirmDelete.value) return (confirmDelete.value = true)
  const { response } = await api.DELETE('/api/media/{media_id}/', { params: { path: { media_id: currentId.value } } }).catch(() => ({ response: null }))
  if (!response || !(response.ok || response.status === 404)) return (deleteError.value = t('common.nothingDeleted'))
  router.back()
}
watch(currentId, () => (confirmDelete.value = false))
</script>

<template>
  <AppPage :title="title" fixed back-href="/media">
    <div class="player">
      <ErrorText v-if="error && !clip" :message="error" class="px-3 pt-3" />
      <ErrorText :message="loadError" class="px-3 pt-3" />
      <div ref="stage" class="stage">
        <div v-if="clip?.kind === 'video'" class="picture" :style="pictureBox">
          <video
            v-if="videoUrl"
            v-show="!canvasOn"
            ref="video"
            :src="videoUrl"
            :poster="clip.thumbnail_url"
            muted
            playsinline
            preload="auto"
            @loadedmetadata="loaded"
            @play="started"
            @pause="stopped"
            @seeked="seekNow"
            @ended="ended"
            @error="failed"
          ></video>
          <img v-else :src="clip.thumbnail_url" alt="" />
          <canvas v-show="canvasOn" ref="canvas"></canvas>
          <DrawingLayer :shapes="shownShapes" :width="shape.width" :height="shape.height" :editing="!!drawing" :tool="tool" :colour="colour" @add="drawing?.shapes.push($event)" />
        </div>
        <img v-else-if="clip" :src="clip.file_url" alt="" />
      </div>
      <template v-if="clip?.kind === 'video' && videoUrl">
        <div class="readout">
          <span class="clock">{{ clock(frame / fps) }} s</span>
          <span class="faint">{{ $t('media.frame', { n: frame + 1, total }) }}</span>
        </div>
        <button v-if="choosing" type="button" class="use" @click="useFrame">{{ $t('evaluations.useFrame', { n: frame + 1 }) }}</button>
        <button v-if="noteHere" type="button" class="here" @click="notesOpen = true">{{ noteHere.author_name }}: {{ noteHere.body }}</button>
        <input v-if="!drawing" type="range" class="coarse" min="0" :max="total - 1" step="1" :value="frame" :aria-label="$t('media.position')" @input="slide" />
        <div v-if="!drawing" ref="tape" class="tape" @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="up">
          <div class="ticks" :style="ticksStyle">
            <span v-for="n in frameNotes" :key="n.id" class="mark" :style="{ left: `${n.frame! * PX_PER_FRAME - 4}px` }"></span>
          </div>
        </div>
        <div v-if="drawing" class="toolbar">
          <ErrorText :message="drawError" />
          <div class="row">
            <button v-for="x in TOOLS" :key="x" type="button" class="tool" :class="{ on: tool === x }" @click="tool = x">{{ toolLabel(x) }}</button>
            <button type="button" :disabled="drawing.shapes.length === 0" :aria-label="$t('media.undo')" @click="undo"><IonIcon :icon="arrowUndoOutline" /></button>
          </div>
          <div class="row">
            <button v-for="c in COLOURS" :key="c" type="button" class="swatch" :class="{ on: colour === c }" :style="{ background: c }" :aria-label="c" @click="colour = c"></button>
          </div>
          <div class="row">
            <button type="button" class="text" @click="cancelDrawing">{{ $t('common.cancel') }}</button>
            <button type="button" class="text main-text" @click="finishDrawing">{{ drawing.noteId === null ? $t('media.drawingDone') : $t('common.save') }}</button>
          </div>
        </div>
        <div v-else class="controls">
          <button type="button" class="speed" :aria-label="$t('media.speed')" @click="cycleSpeed">{{ speedLabel(speed) }}</button>
          <button type="button" :disabled="!hasPrevious" :aria-label="$t('media.previousClip')" @click="goTo(-1)"><IonIcon :icon="playSkipBack" /></button>
          <button type="button" :aria-label="$t('media.stepBack')" @click="step(-1)"><IonIcon :icon="chevronBack" /></button>
          <button type="button" class="main" :aria-label="playing ? $t('media.pause') : $t('media.play')" @click="toggle"><IonIcon :icon="playing ? pause : play" /></button>
          <button type="button" :aria-label="$t('media.stepForward')" @click="step(1)"><IonIcon :icon="chevronForward" /></button>
          <button type="button" :disabled="!hasNext" :aria-label="$t('media.nextClip')" @click="goTo(1)"><IonIcon :icon="playSkipForward" /></button>
          <button v-if="canDraw" type="button" :aria-label="$t('media.draw')" @click="startDrawing(attached, null)"><IonIcon :icon="createOutline" /></button>
          <button v-if="frameNotes.length > 0 || teams.data.value?.length" type="button" class="notes" :aria-label="$t('media.notes')" @click="notesOpen = true">
            <IonIcon :icon="chatbubbleOutline" /><span v-if="frameNotes.length > 0" class="count">{{ frameNotes.length }}</span>
          </button>
        </div>
      </template>
      <div v-if="clip?.kind === 'video' && !videoUrl && !loadError" class="faint px-3">{{ $t('common.loading') }}</div>
      <div v-if="clip && clip.owner !== clip.uploaded_by" class="muted px-3">{{ $t('media.addedBy', { name: clip.uploaded_by_name }) }}</div>
      <ErrorText :message="deleteError" class="px-3" />
      <button v-if="clip?.can_edit" type="button" class="remove" @click="remove">
        <IonIcon :icon="trashOutline" /> {{ confirmDelete ? $t('media.deleteConfirm') : $t('media.delete') }}
      </button>
    </div>
    <IonModal :is-open="notesOpen" :initial-breakpoint="0.7" :breakpoints="[0, 0.7, 1]" @did-dismiss="notesOpen = false">
      <div class="screen sheet">
        <h2 class="h5 m-0">{{ $t('media.notes') }}</h2>
        <ErrorText :message="notes.error.value" />
        <div v-if="attached.length > 0" class="d-flex align-items-center justify-content-between gap-2">
          <span>{{ $t('media.drawingAttached', { n: attached.length }) }}</span>
          <button type="button" class="text" @click="attached = []">{{ $t('media.drawingRemove') }}</button>
        </div>
        <NewNote
          v-if="clip && teams.data.value && teams.data.value.length > 0"
          :archer-id="clip.owner"
          :ends="[]"
          :teams="teams.data.value"
          :frame="{ mediaId: clip.id, frame, timeMs: Math.round((frame / fps) * 1000), drawing: attached.length > 0 ? { v: 1, shapes: attached } : null }"
          @added="() => { attached = []; notes.reload() }"
        />
        <div v-if="frameNotes.length === 0" class="muted">{{ $t('media.noNotes') }}</div>
        <NoteRow v-for="n in frameNotes" :key="n.id" :note="n" :ends="[]" @changed="notes.reload" @jump="jump" @edit-drawing="editDrawing" />
      </div>
    </IonModal>
  </AppPage>
</template>

<style scoped>
.player {
  display: flex;
  flex-direction: column;
  gap: 8px;
  height: 100%;
  padding-bottom: 12px;
}
.stage {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #000;
}
.picture {
  position: relative;
}
.picture video,
.picture img,
.picture canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: fill;
}
.stage > img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}
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
.text {
  border: 0;
  background: transparent;
  color: var(--ion-color-primary);
  font-weight: 600;
}
.readout {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding-inline: 16px;
}
.clock {
  font-size: 1.4rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.coarse {
  margin-inline: 16px;
  accent-color: var(--ion-color-primary);
}
.tape {
  position: relative;
  height: 56px;
  overflow: hidden;
  touch-action: none;
  color: var(--ion-text-color);
  background: color-mix(in srgb, currentcolor 10%, transparent);
}
.tape::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: calc(50% - 1px);
  width: 2px;
  background: var(--ion-color-primary);
}
.ticks {
  position: absolute;
  inset-block: 0;
  left: 0;
  background-image: linear-gradient(to right, color-mix(in srgb, currentcolor 55%, transparent) 0 1px, transparent 1px), linear-gradient(to right, color-mix(in srgb, currentcolor 85%, transparent) 0 2px, transparent 2px);
  background-size: 12px 40%, 120px 75%;
  background-repeat: repeat-x;
  background-position: left bottom;
  color: inherit;
  will-change: transform;
}
.controls {
  display: flex;
  align-items: center;
  justify-content: space-around;
  padding-inline: 8px;
}
.controls button,
.remove {
  min-width: 48px;
  height: 48px;
  border: 0;
  border-radius: 24px;
  background: transparent;
  color: inherit;
  font-size: 24px;
}
.controls button:disabled {
  opacity: 0.3;
}
.controls .speed {
  font-size: 1rem;
  font-weight: 700;
}
.controls .main {
  background: var(--ion-color-primary);
  color: var(--ion-color-primary-contrast);
  width: 64px;
  height: 64px;
  border-radius: 32px;
  font-size: 32px;
}
.controls .notes {
  position: relative;
}
.count {
  position: absolute;
  top: 2px;
  right: 0;
  min-width: 18px;
  padding-inline: 4px;
  border-radius: 9px;
  background: var(--ion-color-primary);
  color: var(--ion-color-primary-contrast);
  font-size: 0.75rem;
  line-height: 18px;
}
.mark {
  position: absolute;
  top: 2px;
  width: 8px;
  height: 8px;
  border-radius: 4px;
  background: var(--ion-color-primary);
}
.use {
  margin-inline: 16px;
  min-height: 48px;
  border: 0;
  border-radius: 24px;
  background: var(--ion-color-primary);
  color: var(--ion-color-primary-contrast);
  font-size: 1rem;
  font-weight: 700;
}
.here {
  margin-inline: 16px;
  padding: 6px 10px;
  border: 0;
  border-radius: 8px;
  background: color-mix(in srgb, currentcolor 10%, transparent);
  color: inherit;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sheet {
  overflow-y: auto;
  height: 100%;
}
.remove {
  align-self: center;
  font-size: 1rem;
}
</style>
