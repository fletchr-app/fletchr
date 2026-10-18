<script lang="ts">
export const MARKER_PX = 5

export type View4 = { x: number; y: number; w: number; h: number }
export type Marker = { cx: number; cy: number; selected: boolean }
/** A group of arrows: its centre and mean radius, in cm in the drawing's orientation (y down). */
export type GroupMark = { cx: number; cy: number; r: number }
</script>

<script setup lang="ts">
import { computed } from 'vue'

import type { Face } from '@/lib/faces'
import { ringFill, ringLine } from '@/lib/plot'
import { outerRadiusCm } from '@/lib/scoring'

// The face drawn in cm, looking at `view`. Used for the whole face and, zoomed in, for the magnifier.
const props = withDefaults(
  defineProps<{
    face: Face
    view: View4
    width: number
    height: number
    cmPerPx: number
    markers: Marker[]
    groups?: GroupMark[]
  }>(),
  { groups: () => [] },
)

const line = computed(() => props.cmPerPx)
const markerR = computed(() => MARKER_PX * props.cmPerPx)
const radius = computed(() => outerRadiusCm(props.face))
const rings = computed(() =>
  [...props.face.rings].reverse().map((ring) => {
    const fill = ringFill(props.face, ring.value)
    return { value: ring.value, r: ring.diameter_cm / 2, fill, stroke: ringLine(fill) }
  }),
)
</script>

<template>
  <svg :width="width" :height="height" :viewBox="`${view.x} ${view.y} ${view.w} ${view.h}`">
    <g v-for="(spot, i) in face.spots" :key="i">
      <template v-if="face.rings.length === 0">
        <circle :cx="spot.x" :cy="-spot.y" :r="radius" fill="#f2f2f2" stroke="#1c1c1c" :stroke-width="line" />
        <line :x1="spot.x - radius" :y1="-spot.y" :x2="spot.x + radius" :y2="-spot.y" stroke="#bbb" :stroke-width="line" />
        <line :x1="spot.x" :y1="-spot.y - radius" :x2="spot.x" :y2="-spot.y + radius" stroke="#bbb" :stroke-width="line" />
      </template>
      <template v-else>
        <circle v-for="ring in rings" :key="ring.value" :cx="spot.x" :cy="-spot.y" :r="ring.r" :fill="ring.fill" :stroke="ring.stroke" :stroke-width="line" />
      </template>
      <circle v-if="face.x_diameter_cm" :cx="spot.x" :cy="-spot.y" :r="face.x_diameter_cm / 2" fill="none" stroke="#1c1c1c" :stroke-width="line" />
    </g>
    <g v-for="(m, i) in markers" :key="i">
      <circle v-if="m.selected" :cx="m.cx" :cy="m.cy" :r="markerR * 2" fill="none" stroke="#ff00ff" :stroke-width="line * 2" />
      <circle :cx="m.cx" :cy="m.cy" :r="markerR" fill="#00e676" stroke="#000" :stroke-width="line * 1.5" />
    </g>
    <g v-for="(g, i) in groups" :key="`group-${i}`">
      <circle
        v-if="g.r > 0"
        :cx="g.cx" :cy="g.cy" :r="g.r" fill="none" stroke="#ff00ff" :stroke-width="line * 2"
        :stroke-dasharray="`${line * 6} ${line * 4}`"
      />
      <line :x1="g.cx - markerR * 2" :y1="g.cy" :x2="g.cx + markerR * 2" :y2="g.cy" stroke="#ff00ff" :stroke-width="line * 2" />
      <line :x1="g.cx" :y1="g.cy - markerR * 2" :x2="g.cx" :y2="g.cy + markerR * 2" stroke="#ff00ff" :stroke-width="line * 2" />
    </g>
  </svg>
</template>
