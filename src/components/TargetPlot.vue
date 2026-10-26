<script setup lang="ts">
import { computed, ref } from 'vue'

import FaceSvg, { type Marker } from '@/components/FaceSvg.vue'
import { useElementSize } from '@/composables/useElementSize'
import type { Face } from '@/lib/faces'
import type { LogShot } from '@/lib/log-model'
import { fitScale, nearestShot, pickAt, sceneOf, toPixel, type PlotPoint } from '@/lib/plot'
import { score } from '@/lib/scoring'
import { newId } from '@/lib/uuid'

const HIT_PX = 16 // how close a touch must be to an arrow to move it instead of placing a new one
const ZOOM = 3
const CROSS_OFFSET_PX = 44 // how far above the finger the position cross sits
const CROSS_PX = 28
const EDGE_PX = 56 // within this of the face's edge the view keeps panning towards it
const PAN_PER_SECOND = 0.4 // of the face's size, at the very edge

// Touch the face to place an arrow: while the finger is down the whole view zooms in around the
// touch and a cross a bit above the finger marks the exact spot; lifting places the arrow. The
// cross follows the finger at a third of its speed (the face slides underneath), and holding it
// near the edge of the face keeps panning, so every spot can be reached. Touching an existing arrow moves it instead. The face is drawn as large as fits the space the
// parent gives this component (it fills the parent's height).
const props = defineProps<{ face: Face; shots: LogShot[]; max: number; selectedId: string | null; numberNext?: number | null }>()
const emit = defineEmits<{ change: [shots: LogShot[]] }>()

const box = ref<HTMLElement | null>(null)
const boxSize = useElementSize(box)
const boxWidth = computed(() => boxSize.value.width)
// px, py: the arrow's spot, in the unzoomed face. sx, sy: where the cross is on screen (the spot is shown there).
const touch = ref<{ px: number; py: number; sx: number; sy: number } | null>(null)
const dragIndex = ref(-1)

const scene = computed(() => sceneOf(props.face))
const scale = computed(() => (boxWidth.value > 0 && boxSize.value.height > 0 ? fitScale(scene.value, boxWidth.value, boxSize.value.height) : 1))
const width = computed(() => scene.value.width * scale.value)
const height = computed(() => scene.value.height * scale.value)

function shotAt(point: PlotPoint, id: string, keep?: LogShot): LogShot {
  const result = score(props.face, point.x, point.y)
  return { ...keep, id, value: result.value, is_x: result.is_x, is_miss: result.is_miss, x: point.x, y: point.y, spot: point.spot }
}

// Gesture state. Not reactive: only `touch` and `dragIndex` change what is drawn.
let pointerId = -1
let startX = 0
let startY = 0
let rectLeft = 0
let rectTop = 0
let lastClientX = 0
let lastClientY = 0
let raf = 0
let drag = -1
let x = 0
let y = 0
let anchorX = 0
let anchorY = 0

const full = () => drag < 0 && props.shots.length >= props.max
const clamp = (v: number, hi: number) => Math.max(0, Math.min(v, hi))

function onDown(e: PointerEvent) {
  if (pointerId >= 0) return
  const target = e.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()
  pointerId = e.pointerId
  target.setPointerCapture(e.pointerId)
  rectLeft = rect.left
  rectTop = rect.top
  lastClientX = e.clientX
  lastClientY = e.clientY
  startX = clamp(e.clientX - rectLeft, width.value)
  startY = clamp(e.clientY - rectTop, height.value)
  const plotted = props.shots.flatMap((s, i) => (s.x === undefined || s.y === undefined ? [] : [i]))
  const points = plotted.map((i) => toPixel(props.face, scene.value, scale.value, { spot: props.shots[i]!.spot ?? 0, x: props.shots[i]!.x!, y: props.shots[i]!.y! }))
  const hit = nearestShot(points, startX, startY, HIT_PX)
  drag = hit >= 0 ? plotted[hit]! : -1
  anchorX = x = startX
  anchorY = y = clamp(startY - CROSS_OFFSET_PX, height.value)
  if (!full()) {
    show() // a full end only lets arrows be moved
    raf = requestAnimationFrame(pan)
  }
}

function onMove(e: PointerEvent) {
  if (e.pointerId !== pointerId || full()) return
  // The view is zoomed, so a finger movement moves the spot ZOOM times less on the face.
  x = clamp(x + (e.clientX - lastClientX) / ZOOM, width.value)
  y = clamp(y + (e.clientY - lastClientY) / ZOOM, height.value)
  lastClientX = e.clientX
  lastClientY = e.clientY
  anchorX = clamp(e.clientX - rectLeft, width.value)
  anchorY = clamp(e.clientY - rectTop - CROSS_OFFSET_PX, height.value)
  show()
}

// With the cross near the edge of the face, move the spot towards the edge, faster the closer it is.
const push = (a: number, size: number) => (a < EDGE_PX ? -(EDGE_PX - a) / EDGE_PX : a > size - EDGE_PX ? (a - (size - EDGE_PX)) / EDGE_PX : 0)
let lastFrame = 0
function pan(now: number) {
  if (pointerId < 0) return
  const dt = lastFrame ? Math.min((now - lastFrame) / 1000, 0.05) : 0
  lastFrame = now
  const dx = push(anchorX, width.value)
  const dy = push(anchorY, height.value)
  if (dx || dy) {
    x = clamp(x + dx * PAN_PER_SECOND * width.value * dt, width.value)
    y = clamp(y + dy * PAN_PER_SECOND * width.value * dt, height.value)
    show()
  }
  raf = requestAnimationFrame(pan)
}

function onUp(e: PointerEvent) {
  if (e.pointerId !== pointerId) return
  finish(e.type === 'pointerup')
}

function finish(commit: boolean) {
  pointerId = -1
  cancelAnimationFrame(raf)
  lastFrame = 0
  if (commit && !full()) {
    const point = pickAt(props.face, scene.value, scale.value, x, y)
    if (drag >= 0) emit('change', props.shots.map((s, i) => (i === drag ? shotAt(point, s.id, s) : s)))
    else emit('change', [...props.shots, { ...shotAt(point, newId()), ...(props.numberNext != null ? { arrow_number: props.numberNext } : {}) }])
  }
  touch.value = null
  dragIndex.value = -1
}

function show() {
  touch.value = { px: x, py: y, sx: anchorX, sy: anchorY }
  dragIndex.value = drag
}

const markers = computed<Marker[]>(() =>
  props.shots.flatMap((s, i) => {
    if (s.x === undefined || s.y === undefined) return []
    const point = i === dragIndex.value && touch.value ? pickAt(props.face, scene.value, scale.value, touch.value.px, touch.value.py) : { spot: s.spot ?? 0, x: s.x, y: s.y }
    const spot = props.face.spots[Math.min(point.spot, props.face.spots.length - 1)]!
    return [{ cx: spot.x + point.x * scene.value.radius, cy: -(spot.y + point.y * scene.value.radius), selected: s.id === props.selectedId }]
  }),
)

const preview = computed(() => {
  if (!touch.value) return null
  const picked = pickAt(props.face, scene.value, scale.value, touch.value.px, touch.value.py)
  const result = score(props.face, picked.x, picked.y)
  return result.is_miss ? 'M' : result.is_x ? 'X' : result.value === null ? '' : String(result.value)
})
</script>

<template>
  <div ref="box" class="w-100 d-flex justify-content-center align-items-center overflow-hidden" style="flex: 1 1 0; min-height: 0">
    <div
      v-if="boxWidth > 0 && boxSize.height > 0"
      class="position-relative"
      :style="{ width: `${width}px`, height: `${height}px`, ...(touch ? { transform: `translate(${touch.sx - ZOOM * touch.px}px, ${touch.sy - ZOOM * touch.py}px) scale(${ZOOM})`, transformOrigin: '0 0' } : {}) }"
    >
      <FaceSvg
        :face="face"
        :view="{ x: scene.x0, y: scene.y0, w: scene.width, h: scene.height }"
        :width="width"
        :height="height"
        :cm-per-px="1 / scale"
        :markers="markers"
      />
      <div
        class="position-absolute top-0 start-0 w-100 h-100"
        style="touch-action: none; user-select: none; cursor: crosshair"
        @pointerdown="onDown"
        @pointermove="onMove"
        @pointerup="onUp"
        @pointercancel="onUp"
      ></div>
      <div
        v-if="touch"
        class="position-absolute"
        :style="{ left: `${touch.px}px`, top: `${touch.py}px`, width: `${CROSS_PX}px`, height: `${CROSS_PX}px`, transform: `translate(-50%, -50%) scale(${1 / ZOOM})`, pointerEvents: 'none' }"
      >
        <div class="position-absolute top-0 bottom-0" :style="{ left: `${CROSS_PX / 2 - 1}px`, width: '2px', backgroundColor: '#ff00ff' }"></div>
        <div class="position-absolute start-0 end-0" :style="{ top: `${CROSS_PX / 2 - 1}px`, height: '2px', backgroundColor: '#ff00ff' }"></div>
        <div class="position-absolute start-50 translate-middle-x bg-black text-white fw-bold rounded-pill px-2" style="bottom: 100%; margin-bottom: 6px">
          {{ preview || '·' }}
        </div>
      </div>
    </div>
  </div>
</template>
