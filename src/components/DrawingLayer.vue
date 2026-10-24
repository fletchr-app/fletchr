<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import { angleDegrees, circleRadii, POINTS, type Point, pointOn, type Shape, type Tool } from '@/lib/drawing'

// Lines, angles and circles over a picture. The layer has the shape of the picture, so the points (fractions of it) are
// drawn where they were put. With `editing` a finger draws: drag for a line or a circle, three taps for an angle.
const props = withDefaults(defineProps<{ shapes: Shape[]; width: number; height: number; editing?: boolean; tool?: Tool; colour?: string }>(), {
  editing: false,
  tool: 'line',
  colour: '#ff3b30',
})
const emit = defineEmits<{ add: [shape: Shape] }>()

const root = ref<HTMLElement | null>(null)
const pending = ref<Point[]>([]) // the points of the shape that is being drawn
const cursor = ref<Point | null>(null)
let dragging = false
watch(() => [props.tool, props.editing], () => (pending.value = []))

const preview = computed<Shape | null>(() => {
  if (!cursor.value || pending.value.length === 0) return null
  return { t: props.tool, p: [...pending.value, cursor.value], c: props.colour }
})
const all = computed(() => (preview.value ? [...props.shapes, preview.value] : props.shapes))

function at(e: PointerEvent): Point {
  return pointOn(root.value!.getBoundingClientRect(), e.clientX, e.clientY)
}
function down(e: PointerEvent) {
  if (!props.editing) return
  root.value!.setPointerCapture(e.pointerId)
  dragging = true
  cursor.value = at(e)
  if (props.tool !== 'angle') pending.value = [cursor.value]
}
function move(e: PointerEvent) {
  if (props.editing && dragging) cursor.value = at(e)
}
function up(e: PointerEvent) {
  if (!props.editing || !dragging) return
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
    <span v-for="(l, i) in labels" :key="i" class="label" :style="{ left: pct(l.at[0]), top: pct(l.at[1]), color: l.colour }">{{ l.text }}</span>
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
.label {
  position: absolute;
  transform: translate(10px, -26px);
  font-weight: 700;
  font-size: 1rem;
  text-shadow: 0 0 3px #000;
  pointer-events: none;
}
</style>
