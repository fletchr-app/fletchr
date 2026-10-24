<script setup lang="ts">
import { IonIcon } from '@ionic/vue'
import { chevronBack, chevronForward, pause, play, playSkipBack, playSkipForward, trashOutline } from 'ionicons/icons'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import AppPage from '@/components/AppPage.vue'
import ErrorText from '@/components/ErrorText.vue'
import { useAuth } from '@/composables/useAuth'
import { useRemote } from '@/composables/useRemote'
import { FrameDecoder } from '@/lib/frame-decoder'
import { clock, frameAt, frameRate, nextSpeed, scrubbed, seekTime, speedLabel, stepped, totalFrames } from '@/lib/player'

// One uploaded clip, to look at frame by frame: the video above, a tape below it that is dragged sideways (one
// tick is one frame), and the controls. The clips of the same session or archer are one tap away.
const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const { api } = useAuth()

const PX_PER_FRAME = 12
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
  duration.value = video.value!.duration
  video.value!.playbackRate = speed.value
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
      <div class="stage">
        <template v-if="clip?.kind === 'video'">
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
        </template>
        <img v-else-if="clip" :src="clip.file_url" alt="" />
      </div>
      <template v-if="clip?.kind === 'video' && videoUrl">
        <div class="readout">
          <span class="clock">{{ clock(frame / fps) }} s</span>
          <span class="faint">{{ $t('media.frame', { n: frame + 1, total }) }}</span>
        </div>
        <input type="range" class="coarse" min="0" :max="total - 1" step="1" :value="frame" :aria-label="$t('media.position')" @input="slide" />
        <div ref="tape" class="tape" @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="up">
          <div class="ticks" :style="ticksStyle"></div>
        </div>
        <div class="controls">
          <button type="button" class="speed" :aria-label="$t('media.speed')" @click="cycleSpeed">{{ speedLabel(speed) }}</button>
          <button type="button" :disabled="!hasPrevious" :aria-label="$t('media.previousClip')" @click="goTo(-1)"><IonIcon :icon="playSkipBack" /></button>
          <button type="button" :aria-label="$t('media.stepBack')" @click="step(-1)"><IonIcon :icon="chevronBack" /></button>
          <button type="button" class="main" :aria-label="playing ? $t('media.pause') : $t('media.play')" @click="toggle"><IonIcon :icon="playing ? pause : play" /></button>
          <button type="button" :aria-label="$t('media.stepForward')" @click="step(1)"><IonIcon :icon="chevronForward" /></button>
          <button type="button" :disabled="!hasNext" :aria-label="$t('media.nextClip')" @click="goTo(1)"><IonIcon :icon="playSkipForward" /></button>
        </div>
      </template>
      <div v-if="clip?.kind === 'video' && !videoUrl && !loadError" class="faint px-3">{{ $t('common.loading') }}</div>
      <div v-if="clip && clip.owner !== clip.uploaded_by" class="muted px-3">{{ $t('media.addedBy', { name: clip.owner_name }) }}</div>
      <ErrorText :message="deleteError" class="px-3" />
      <button v-if="clip?.can_edit" type="button" class="remove" @click="remove">
        <IonIcon :icon="trashOutline" /> {{ confirmDelete ? $t('media.deleteConfirm') : $t('media.delete') }}
      </button>
    </div>
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
.stage video,
.stage img,
.stage canvas {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
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
.remove {
  align-self: center;
  font-size: 1rem;
}
</style>
