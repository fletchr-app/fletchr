<script setup lang="ts">
import { computed, ref } from 'vue'

import FaceSvg, { type Marker } from '@/components/FaceSvg.vue'
import { useElementSize } from '@/composables/useElementSize'
import type { Face } from '@/lib/faces'
import type { LogShot } from '@/lib/log-model'
import { fitScale, magnifierPlacement, nearestShot, pickAt, sceneOf, toPixel, type PlotPoint } from '@/lib/plot'
import { score } from '@/lib/scoring'
import { newId } from '@/lib/uuid'

const HIT_PX = 16 // how close a touch must be to an arrow to move it instead of placing a new one
const MAGNIFIER_PX = 130
const ZOOM = 4
const GAP_PX = 36

// Touch the face to place an arrow: while the finger is down a magnifier above it shows the exact
// spot, and lifting places the arrow. Touching an existing arrow moves it instead. The face is
// drawn as large as fits the space the parent gives this component (it fills the parent's height).
const props = defineProps<{ face: Face; shots: LogShot[]; max: number; selectedId: string | null }>()
const emit = defineEmits<{ change: [shots: LogShot[]] }>()

const box = ref<HTMLElement | null>(null)
const boxSize = useElementSize(box)
const boxWidth = computed(() => boxSize.value.width)
const touch = ref<{ px: number; py: number } | null>(null)
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
let startClientX = 0
let startClientY = 0
let drag = -1
let x = 0
let y = 0

const full = () => drag < 0 && props.shots.length >= props.max
const clamp = (v: number, hi: number) => Math.max(0, Math.min(v, hi))

function onDown(e: PointerEvent) {
  if (pointerId >= 0) return
  const target = e.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()
  pointerId = e.pointerId
  target.setPointerCapture(e.pointerId)
  startClientX = e.clientX
  startClientY = e.clientY
  startX = clamp(e.clientX - rect.left, width.value)
  startY = clamp(e.clientY - rect.top, height.value)
  const plotted = props.shots.flatMap((s, i) => (s.x === undefined || s.y === undefined ? [] : [i]))
  const points = plotted.map((i) => toPixel(props.face, scene.value, scale.value, { spot: props.shots[i]!.spot ?? 0, x: props.shots[i]!.x!, y: props.shots[i]!.y! }))
  const hit = nearestShot(points, startX, startY, HIT_PX)
  drag = hit >= 0 ? plotted[hit]! : -1
  x = startX
  y = startY
  if (!full()) show() // a full end only lets arrows be moved
}

function onMove(e: PointerEvent) {
  if (e.pointerId !== pointerId || full()) return
  x = clamp(startX + e.clientX - startClientX, width.value)
  y = clamp(startY + e.clientY - startClientY, height.value)
  show()
}

function onUp(e: PointerEvent) {
  if (e.pointerId !== pointerId) return
  finish(e.type === 'pointerup')
}

function finish(commit: boolean) {
  pointerId = -1
  if (commit && !full()) {
    const point = pickAt(props.face, scene.value, scale.value, x, y)
    if (drag >= 0) emit('change', props.shots.map((s, i) => (i === drag ? shotAt(point, s.id, s) : s)))
    else emit('change', [...props.shots, shotAt(point, newId())])
  }
  touch.value = null
  dragIndex.value = -1
}

function show() {
  touch.value = { px: x, py: y }
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
const place = computed(() => (touch.value ? magnifierPlacement(touch.value.px, touch.value.py, width.value, MAGNIFIER_PX, GAP_PX) : null))
const half = computed(() => MAGNIFIER_PX / (2 * scale.value * ZOOM))
const centreX = computed(() => (touch.value ? scene.value.x0 + touch.value.px / scale.value : 0))
const centreY = computed(() => (touch.value ? scene.value.y0 + touch.value.py / scale.value : 0))
</script>

<template>
  <div ref="box" class="w-100 d-flex justify-content-center align-items-center" style="flex: 1 1 0; min-height: 0">
    <div v-if="boxWidth > 0 && boxSize.height > 0" class="position-relative" :style="{ width: `${width}px`, height: `${height}px` }">
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
        v-if="touch && place"
        class="position-absolute overflow-hidden border border-2 border-dark bg-white"
        :style="{ left: `${place.left}px`, top: `${place.top}px`, width: `${MAGNIFIER_PX}px`, height: `${MAGNIFIER_PX}px`, borderRadius: '50%', pointerEvents: 'none' }"
      >
        <FaceSvg
          :face="face"
          :view="{ x: centreX - half, y: centreY - half, w: 2 * half, h: 2 * half }"
          :width="MAGNIFIER_PX"
          :height="MAGNIFIER_PX"
          :cm-per-px="1 / (scale * ZOOM)"
          :markers="markers"
        />
        <div class="position-absolute top-0 bottom-0" :style="{ left: `${MAGNIFIER_PX / 2 - 1}px`, width: '1px', backgroundColor: '#ff00ff' }"></div>
        <div class="position-absolute start-0 end-0" :style="{ top: `${MAGNIFIER_PX / 2 - 1}px`, height: '1px', backgroundColor: '#ff00ff' }"></div>
        <div class="position-absolute start-50 translate-middle-x bg-black text-white fw-bold rounded-pill px-2" style="bottom: 4px">
          {{ preview || '·' }}
        </div>
      </div>
    </div>
  </div>
</template>
