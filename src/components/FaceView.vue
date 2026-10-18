<script setup lang="ts">
import { computed, ref } from 'vue'

import FaceSvg, { type GroupMark, type Marker } from '@/components/FaceSvg.vue'
import { useElementWidth } from '@/composables/useElementWidth'
import type { Face } from '@/lib/faces'
import { groupOf } from '@/lib/group'
import type { LogShot } from '@/lib/log-model'
import { fitScale, sceneOf } from '@/lib/plot'

const MAX_HEIGHT_PX = 380

// The face with the arrows that have a position, and for each spot the centre and spread of its group. Read-only.
const props = defineProps<{ face: Face; shots: LogShot[] }>()

const box = ref<HTMLElement | null>(null)
const boxWidth = useElementWidth(box)
const scene = computed(() => sceneOf(props.face))
const scale = computed(() => (boxWidth.value > 0 ? fitScale(scene.value, boxWidth.value, MAX_HEIGHT_PX) : 1))

const at = (spot: number, x: number, y: number) => {
  const s = props.face.spots[Math.min(spot, props.face.spots.length - 1)]!
  return { cx: s.x + x * scene.value.radius, cy: -(s.y + y * scene.value.radius) }
}
const plotted = computed(() => props.shots.flatMap((s) => (s.x === undefined || s.y === undefined ? [] : [{ ...s, x: s.x, y: s.y }])))
const markers = computed<Marker[]>(() => plotted.value.map((s) => ({ ...at(s.spot ?? 0, s.x, s.y), selected: false })))
const groups = computed<GroupMark[]>(() =>
  props.face.spots.flatMap((_, spot) => {
    const group = groupOf(plotted.value.filter((s) => (s.spot ?? 0) === spot))
    return group ? [{ ...at(spot, group.cx, group.cy), r: group.meanRadius * scene.value.radius }] : []
  }),
)
</script>

<template>
  <div ref="box" class="w-100 d-flex justify-content-center">
    <FaceSvg
      v-if="boxWidth > 0"
      :face="face"
      :view="{ x: scene.x0, y: scene.y0, w: scene.width, h: scene.height }"
      :width="scene.width * scale"
      :height="scene.height * scale"
      :cm-per-px="1 / scale"
      :markers="markers"
      :groups="groups"
    />
  </div>
</template>
