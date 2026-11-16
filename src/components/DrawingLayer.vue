<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import { angleDegrees, circleRadii, clamp01, LIFT, type Mode, movedGroup, nearestPoint, POINTS, type Point, pointOn, pointsAt, type Shape, snapped } from '@/lib/drawing'

// Lines, angles and circles over a picture. The layer has the shape of the picture, so the points (fractions of it) are
// drawn where they were put, also while the picture is pinched bigger (its on-screen box is measured when a finger goes
// down). With `editing` a finger draws: drag for a line or a circle, three taps for an angle. While a finger draws, the
// point that is drawn sits a little above the finger (marked by a cross). With the tool `move` a finger takes hold of a point
// that is already there, with every point at the same place, and drags it: the point stays under the finger. A second finger
// is for pinching and stops what the first one began. `scale` is how much the picture is magnified, so that marks keep their size.
const props = withDefaults(defineProps<{ shapes: Shape[]; width: number; height: number; editing?: boolean; tool?: Mode; colour?: string; scale?: number }>(), {
  editing: false,
  scale: 1,
  tool: 'line',
  colour: '#ff3b30',
})
const emit = defineEmits<{
  add: [shape: Shape]
  change: [index: number, shape: Shape]
}>()

const REACH = 28 // pixels: how far from a point a finger may touch it to take hold of it

const root = ref<HTMLElement | null>(null)
const pending = ref<Point[]>([]) // the points of the shape that is being drawn
const cursor = ref<Point | null>(null)
const tip = ref<Point | null>(null) // the point that is drawn while a finger is down
let dragging = false
let grabbed: { shape: number; point: number }[] | null = null // the grabbed point and every point at the same place
let grabAt: Point = [0, 0] // where the grabbed point was
let grabFrom = { x: 0, y: 0 } // where the finger went down
// Where the layer is on the screen (with the picture pinched, its box is the magnified one), measured when the finger goes down.
let box: { left: number; top: number; width: number; height: number } | null = null
watch(() => [props.tool, props.editing], () => (pending.value = []))

const preview = computed<Shape | null>(() => {
  if (!cursor.value || pending.value.length === 0 || props.tool === 'move') return null
  return { t: props.tool, p: [...pending.value, cursor.value], c: props.colour }
})
const all = computed(() => (preview.value ? [...props.shapes, preview.value] : props.shapes))
const handles = computed(() => (props.editing && props.tool === 'move' ? props.shapes.flatMap((s) => s.p) : []))

/** The point a finger means: LIFT pixels above it. */
function meant(e: PointerEvent): Point {
  const p = pointOn(box!, e.clientX, e.clientY - LIFT)
  return props.tool === 'angle' ? snapped(props.shapes, p, box!, REACH) : p // an angle takes its points from the joints that are there
}
/** Where the grabbed point goes: as far as the finger moved since it took hold, so the point stays where it was under the finger. */
function carried(e: PointerEvent): Point {
  return [clamp01(grabAt[0] + (e.clientX - grabFrom.x) / box!.width), clamp01(grabAt[1] + (e.clientY - grabFrom.y) / box!.height)]
}
function moveGrabbed(to: Point) {
  for (const { index, shape } of movedGroup(props.shapes, grabbed!, to)) emit('change', index, shape)
}
/** Stops what a finger began: a second finger means a pinch, and nothing is to be drawn or moved by it. */
function cancel() {
  tip.value = null
  if (props.tool !== 'angle') pending.value = [] // the points of an angle already put stay
  cursor.value = null
  dragging = false
  grabbed = null
}

function down(e: PointerEvent) {
  if (!props.editing) return
  if (!e.isPrimary) return cancel()
  box = root.value!.getBoundingClientRect()
  if (props.tool === 'move') {
    const hit = nearestPoint(props.shapes, pointOn(box, e.clientX, e.clientY), box, REACH)
    if (!hit) return
    grabbed = pointsAt(props.shapes, hit, box)
    root.value!.setPointerCapture(e.pointerId)
    const at = props.shapes[hit.shape]!.p[hit.point]!
    grabAt = at
    grabFrom = { x: e.clientX, y: e.clientY }
    tip.value = at
    return
  }
  root.value!.setPointerCapture(e.pointerId)
  dragging = true
  cursor.value = meant(e)
  tip.value = cursor.value
  if (props.tool !== 'angle') pending.value = [cursor.value]
}
function move(e: PointerEvent) {
  if (!props.editing || !e.isPrimary) return
  if (grabbed) {
    const to = carried(e)
    moveGrabbed(to)
    tip.value = to
  } else if (dragging) {
    cursor.value = meant(e)
    tip.value = cursor.value
  }
}
function up(e: PointerEvent) {
  if (!e.isPrimary) return
  tip.value = null
  if (grabbed) {
    grabbed = null
    return
  }
  if (!props.editing || !dragging || props.tool === 'move') return
  dragging = false
  const here = meant(e)
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
  <div ref="root" class="layer" :class="{ editing }" :style="{ '--inv': 1 / scale }" @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="up">
    <svg viewBox="0 0 1 1" preserveAspectRatio="none">
      <!-- first a dark outline under every shape, then the shapes: a CSS drop-shadow filter on each line is far too slow to paint while the picture is magnified -->
      <template v-for="pass in ['halo', 'main']" :key="pass">
        <template v-for="(s, i) in all" :key="i">
          <line v-if="s.t === 'line' && s.p.length === 2" :class="pass" :x1="s.p[0]![0]" :y1="s.p[0]![1]" :x2="s.p[1]![0]" :y2="s.p[1]![1]" :stroke="pass === 'halo' ? '#000' : colourOf(s)" />
          <polyline v-else-if="s.t === 'angle'" :class="pass" :points="s.p.map((p) => p.join(',')).join(' ')" fill="none" :stroke="pass === 'halo' ? '#000' : colourOf(s)" />
          <ellipse
            v-else-if="s.t === 'circle' && s.p.length === 2"
            :class="pass"
            :cx="s.p[0]![0]"
            :cy="s.p[0]![1]"
            :rx="circleRadii(s.p[0]!, s.p[1]!, width, height).rx"
            :ry="circleRadii(s.p[0]!, s.p[1]!, width, height).ry"
            fill="none"
            :stroke="pass === 'halo' ? '#000' : colourOf(s)"
          />
        </template>
      </template>
    </svg>
    <span v-for="(h, i) in handles" :key="`h${i}`" class="handle" :style="{ left: pct(h[0]), top: pct(h[1]) }"></span>
    <span v-for="(l, i) in labels" :key="i" class="label" :style="{ left: pct(l.at[0]), top: pct(l.at[1]), color: l.colour }">{{ l.text }}</span>
    <span v-if="tip" class="cross" :style="{ left: pct(tip[0]), top: pct(tip[1]) }"></span>
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
}
svg .halo {
  stroke-width: 5;
  opacity: 0.45;
}
/* While the picture is magnified, marks keep their size on the screen (--inv is 1 / zoom). */
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
  transform: scale(var(--inv, 1));
}
.cross {
  position: absolute;
  width: 28px;
  height: 28px;
  margin: -14px 0 0 -14px;
  pointer-events: none;
  transform: scale(var(--inv, 1));
}
.cross::before,
.cross::after {
  content: '';
  position: absolute;
  background: #ff3b30;
  box-shadow: 0 0 2px rgb(0 0 0 / 70%);
}
.cross::before {
  left: 50%;
  top: 0;
  width: 1px;
  height: 100%;
}
.cross::after {
  top: 50%;
  left: 0;
  height: 1px;
  width: 100%;
}
.label {
  position: absolute;
  transform-origin: 0 100%;
  transform: translate(10px, -26px) scale(var(--inv, 1));
  font-weight: 700;
  font-size: 1rem;
  text-shadow: 0 0 3px #000;
  pointer-events: none;
}
</style>
