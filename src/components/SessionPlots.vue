<script setup lang="ts">
import { IonChip } from '@ionic/vue'
import { computed, ref } from 'vue'

import FaceView from '@/components/FaceView.vue'
import { getFace } from '@/lib/faces'
import { describeCentre, spreadCm } from '@/lib/group'
import type { LogSession } from '@/lib/log-model'
import { blocksOf } from '@/lib/session-view'

// With `fill` it takes the height its parent gives it and shows one distance and face at a time (chips switch between them).
const props = defineProps<{ session: Pick<LogSession, 'ends'>; fill?: boolean }>()

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
const shown = ref(0)
const current = computed(() => blocks.value[Math.min(shown.value, blocks.value.length - 1)])
</script>

<template>
  <div v-if="fill && current" class="d-flex flex-column gap-1" style="flex: 1 1 0; min-height: 0">
    <div v-if="blocks.length > 1" class="d-flex flex-wrap gap-2">
      <IonChip
        v-for="(b, i) in blocks"
        :key="b.block.key"
        class="m-0 chip"
        :outline="blocks.indexOf(current) !== i"
        :class="{ selected: blocks.indexOf(current) === i }"
        @click="shown = i"
      >
        {{ Number(b.block.distance_m) }} m · {{ b.face.name }}
      </IonChip>
    </div>
    <div class="fw-semibold">{{ Number(current.block.distance_m) }} m · {{ current.face.name }} · {{ current.block.plotted.length + current.block.typed }} arrows</div>
    <FaceView v-if="current.block.plotted.length > 0" fill :face="current.face" :shots="current.block.plotted" />
    <div v-else class="flex-grow-1"></div>
    <div v-for="{ spot, group } in current.block.groups" :key="spot" class="muted">
      {{ current.face.spots.length > 1 ? `Spot ${spot + 1}: ` : 'Group: ' }}centre {{ describeCentre(group, current.radius) }} · spread
      {{ spreadCm(group, current.radius).toFixed(1) }} cm
    </div>
    <div v-if="current.block.typed > 0" class="faint">{{ current.block.typed }} typed in, not drawn.</div>
  </div>
  <div v-else-if="blocks.length > 0" class="d-flex flex-column gap-3">
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
