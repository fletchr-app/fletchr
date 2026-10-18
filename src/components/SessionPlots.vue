<script setup lang="ts">
import { computed } from 'vue'

import FaceView from '@/components/FaceView.vue'
import { getFace } from '@/lib/faces'
import { describeCentre, spreadCm } from '@/lib/group'
import type { LogSession } from '@/lib/log-model'
import { blocksOf } from '@/lib/session-view'

const props = defineProps<{ session: Pick<LogSession, 'ends'> }>()

// For each distance and face of the session: where the arrows hit, and the group centre and spread.
const blocks = computed(() =>
  blocksOf(props.session)
    .filter((b) => b.plotted.length > 0 || b.typed > 0)
    .flatMap((block) => {
      const face = getFace(block.face)
      if (!face) return []
      const radius = face.rings.length > 0 ? face.rings[face.rings.length - 1]!.diameter_cm / 2 : 20
      return [{ block, face, radius }]
    }),
)
</script>

<template>
  <div v-if="blocks.length > 0" class="d-flex flex-column gap-3">
    <div v-for="{ block, face, radius } in blocks" :key="block.key" class="d-flex flex-column gap-1">
      <div class="fw-semibold">{{ Number(block.distance_m) }} m · {{ face.name }} · {{ block.plotted.length + block.typed }} arrows</div>
      <FaceView v-if="block.plotted.length > 0" :face="face" :shots="block.plotted" />
      <div v-for="{ spot, group } in block.groups" :key="spot">
        {{ face.spots.length > 1 ? `Spot ${spot + 1}: ` : 'Group: ' }}centre {{ describeCentre(group, radius) }} · spread
        {{ spreadCm(group, radius).toFixed(1) }} cm ({{ group.n }} {{ group.n === 1 ? 'arrow' : 'arrows' }})
      </div>
      <div v-if="block.typed > 0" class="faint">
        {{ block.typed }} {{ block.typed === 1 ? 'arrow was' : 'arrows were' }} typed in and cannot be drawn.
      </div>
    </div>
  </div>
</template>
