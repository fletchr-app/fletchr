<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import { angleDegrees, circleRadii, clamp01, type Mode, movedPoint, nearestPoint, POINTS, type Point, pointOn, type Shape } from '@/lib/drawing'

// Lines, angles and circles over a picture. The layer has the shape of the picture, so the points (fractions of it) are
// drawn where they were put. With `editing` a finger draws: drag for a line or a circle, three taps for an angle. With
// the tool `move` it takes hold of a point that is already there and drags it. While a finger is down, a loupe above it
// shows the picture around the point (needs `loupe`, which gives the <img>, <video> or <canvas> the picture is in).
const props = withDefaults(
  defineProps<{ shapes: Shape[]; width: number; height: number; editing?: boolean; tool?: Mode; colour?: string; loupe?: () => CanvasImageSource | null }>(),
  { editing: false, tool: 'line', colour: '#ff3b30', loupe: undefined },
)
const emit = defineEmits<{ add: [shape: Shape]; change: [index: number, shape: Shape] }>()

const REACH = 28 // pixels: how far from a point a finger may touch it to take hold of it
const LOUPE = 104 // pixels across
const ZOOM = 3
const LIFT = 84 // pixels between the finger and the middle of the loupe

const root = ref<HTMLElement | null>(null)
const pending = ref<Point[]>([]) // the points of the shape that is being drawn
const cursor = ref<Point | null>(null)
let dragging = false
let grabbed: { shape: number; point: number; dx: number; dy: number } | null = null
watch(() => [props.tool, props.editing], () => (pending.value = []))

const preview = computed<Shape | null>(() => {
  if (!cursor.value || pending.value.length === 0 || props.tool === 'move') return null
  return { t: props.tool, p: [...pending.value, cursor.value], c: props.colour }
})
const all = computed(() => (preview.value ? [...props.shapes, preview.value] : props.shapes))
const handles = computed(() => (props.editing && props.tool === 'move' ? props.shapes.flatMap((s) => s.p) : []))

function at(e: PointerEvent): Point {
  return pointOn(root.value!.getBoundingClientRect(), e.clientX, e.clientY)
}

// The loupe: where it sits (in pixels of the layer) and the point of the picture it shows.
const loupeAt = ref<{ left: number; top: number; p: Point } | null>(null)
const loupeCanvas = ref<HTMLCanvasElement | null>(null)
function showLoupe(e: PointerEvent, p: Point) {
  if (!props.loupe) return
  const rect = root.value!.getBoundingClientRect()
  const x = Math.min(rect.width - LOUPE / 2, Math.max(LOUPE / 2, e.clientX - rect.left))
  const y = e.clientY - rect.top
  const above = y - LIFT - LOUPE / 2 >= 0 // near the top edge it goes below the finger instead
  loupeAt.value = { left: x - LOUPE / 2, top: (above ? y - LIFT : y + LIFT) - LOUPE / 2, p }
}
function sizeOf(source: CanvasImageSource): { width: number; height: number } {
  if (source instanceof HTMLVideoElement) return { width: source.videoWidth, height: source.videoHeight }
  if (source instanceof HTMLImageElement) return { width: source.naturalWidth, height: source.naturalHeight }
  if (source instanceof HTMLCanvasElement) return { width: source.width, height: source.height }
  return { width: 0, height: 0 }
}
watch(
  loupeAt,
  (l) => {
    const canvas = loupeCanvas.value
    const source = props.loupe?.()
    const context = canvas?.getContext('2d')
    if (!l || !canvas || !source || !context) return
    const natural = sizeOf(source)
    const rect = root.value!.getBoundingClientRect()
    if (!natural.width || !natural.height || !rect.width || !rect.height) return
    const sw = (natural.width * LOUPE) / ZOOM / rect.width
    const sh = (natural.height * LOUPE) / ZOOM / rect.height
    context.clearRect(0, 0, canvas.width, canvas.height)
    try {
      context.drawImage(source, l.p[0] * natural.width - sw / 2, l.p[1] * natural.height - sh / 2, sw, sh, 0, 0, canvas.width, canvas.height)
    } catch {
      // a picture that cannot be read yet: the loupe stays empty
    }
  },
  { flush: 'post' },
)

function down(e: PointerEvent) {
  if (!props.editing) return
  const here = at(e)
  if (props.tool === 'move') {
    const hit = nearestPoint(props.shapes, here, root.value!.getBoundingClientRect(), REACH)
    if (!hit) return
    const point = props.shapes[hit.shape]!.p[hit.point]!
    grabbed = { ...hit, dx: point[0] - here[0], dy: point[1] - here[1] }
    root.value!.setPointerCapture(e.pointerId)
    showLoupe(e, point)
    return
  }
  root.value!.setPointerCapture(e.pointerId)
  dragging = true
  cursor.value = here
  showLoupe(e, here)
  if (props.tool !== 'angle') pending.value = [cursor.value]
}
function move(e: PointerEvent) {
  if (!props.editing) return
  if (grabbed) {
    const here = at(e)
    const to: Point = [clamp01(here[0] + grabbed.dx), clamp01(here[1] + grabbed.dy)]
    emit('change', grabbed.shape, movedPoint(props.shapes[grabbed.shape]!, grabbed.point, to))
    showLoupe(e, to)
  } else if (dragging) {
    cursor.value = at(e)
    showLoupe(e, cursor.value)
  }
}
function up(e: PointerEvent) {
  loupeAt.value = null
  if (grabbed) {
    grabbed = null
    return
  }
  if (!props.editing || !dragging || props.tool === 'move') return
  dragging = false
  const here = at(e)
  if (props.tool === 'angle') {
    pending.value = [...pending.value, here]
    if (pending.value.length === POINTS.angle) finish(pending.value)
    else cursor.value = here
    return
  }
  const start = pending.value[0]!
  if (Math.hypot((here[0] - start[0]) * props.width, (here[1] - start[1]) * props.height) > 8) finish([start, here])
  else {
    pending.value = []
    cursor.value = null
  }
}
function finish(points: Point[]) {
  if (props.tool === 'move') return
  emit('add', { t: props.tool, p: points, c: props.colour })
  pending.value = []
  cursor.value = null
}

const colourOf = (s: Shape) => s.c ?? '#ff3b30'
const pct = (n: number) => `${n * 100}%`
const labels = computed(() =>
  all.value
    .filter((s) => s.t === 'angle' && s.p.length === 3)
    .map((s) => ({ at: s.p[1]!, text: `${Math.round(angleDegrees(s.p[0]!, s.p[1]!, s.p[2]!, props.width, props.height))}°`, colour: colourOf(s) })),
)
</script>

<template>
  <div ref="root" class="layer" :class="{ editing }" @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="up">
    <svg viewBox="0 0 1 1" preserveAspectRatio="none">
      <template v-for="(s, i) in all" :key="i">
        <line v-if="s.t === 'line' && s.p.length === 2" :x1="s.p[0]![0]" :y1="s.p[0]![1]" :x2="s.p[1]![0]" :y2="s.p[1]![1]" :stroke="colourOf(s)" />
        <polyline v-else-if="s.t === 'angle'" :points="s.p.map((p) => p.join(',')).join(' ')" fill="none" :stroke="colourOf(s)" />
        <ellipse
          v-else-if="s.t === 'circle' && s.p.length === 2"
          :cx="s.p[0]![0]"
          :cy="s.p[0]![1]"
          :rx="circleRadii(s.p[0]!, s.p[1]!, width, height).rx"
          :ry="circleRadii(s.p[0]!, s.p[1]!, width, height).ry"
          fill="none"
          :stroke="colourOf(s)"
        />
      </template>
    </svg>
    <span v-for="(h, i) in handles" :key="`h${i}`" class="handle" :style="{ left: pct(h[0]), top: pct(h[1]) }"></span>
    <span v-for="(l, i) in labels" :key="i" class="label" :style="{ left: pct(l.at[0]), top: pct(l.at[1]), color: l.colour }">{{ l.text }}</span>
    <div v-if="loupeAt" class="loupe" :style="{ left: `${loupeAt.left}px`, top: `${loupeAt.top}px`, width: `${LOUPE}px`, height: `${LOUPE}px` }">
      <canvas ref="loupeCanvas" :width="LOUPE * 2" :height="LOUPE * 2"></canvas>
    </div>
  </div>
</template>

<style scoped>
.layer {
  position: absolute;
  inset: 0;
  touch-action: none;
  pointer-events: none;
}
.layer.editing {
  pointer-events: auto;
  cursor: crosshair;
}
svg {
  width: 100%;
  height: 100%;
  display: block;
  overflow: visible;
}
svg :where(line, polyline, ellipse) {
  stroke-width: 3;
  stroke-linecap: round;
  stroke-linejoin: round;
  vector-effect: non-scaling-stroke;
  filter: drop-shadow(0 0 1px rgb(0 0 0 / 70%));
}
.handle {
  position: absolute;
  width: 14px;
  height: 14px;
  margin: -7px 0 0 -7px;
  border-radius: 50%;
  background: #fff;
  border: 2px solid #000;
  opacity: 0.85;
  pointer-events: none;
}
.loupe {
  position: absolute;
  z-index: 2;
  border-radius: 50%;
  border: 3px solid #fff;
  box-shadow: 0 0 6px rgb(0 0 0 / 70%);
  background: #000;
  overflow: hidden;
  pointer-events: none;
}
.loupe canvas {
  width: 100%;
  height: 100%;
  display: block;
}
.loupe::before,
.loupe::after {
  content: '';
  position: absolute;
  background: #ff3b30;
}
.loupe::before {
  left: 50%;
  top: calc(50% - 8px);
  width: 1px;
  height: 16px;
}
.loupe::after {
  top: 50%;
  left: calc(50% - 8px);
  height: 1px;
  width: 16px;
}
.label {
  position: absolute;
  transform: translate(10px, -26px);
  font-weight: 700;
  font-size: 1rem;
  text-shadow: 0 0 3px #000;
  pointer-events: none;
}
</style>
