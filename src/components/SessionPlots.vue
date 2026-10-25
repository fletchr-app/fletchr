<script setup lang="ts">
import { IonChip } from '@ionic/vue'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import FaceView from '@/components/FaceView.vue'
import { useUnits } from '@/composables/useUnits'
import { centredScore } from '@/lib/centred'
import { getFace } from '@/lib/faces'
import { type CentreWords, describeCentre, groupOf, sightMove, spreadCm } from '@/lib/group'
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
const { t } = useI18n()
const { units, formatDistance, formatLength } = useUnits()
const words = computed<CentreWords>(() => ({ left: t('plots.left'), right: t('plots.right'), low: t('plots.low'), high: t('plots.high'), middle: t('plots.middle') }))
const shown = ref(0)
const showNumbers = ref(false)
const current = computed(() => blocks.value[Math.min(shown.value, blocks.value.length - 1)])
// "Move the sight to the left and down", only where the group is big enough and clearly off.
// The arrows of all spots are taken together: every position is relative to its own spot.
const sightText = (plotted: { x: number; y: number }[], radius: number) => {
  const group = groupOf(plotted)
  const move = group && sightMove(group, radius)
  if (!move) return null
  const parts = [move.horizontal === 'left' ? t('plots.toLeft') : move.horizontal === 'right' ? t('plots.toRight') : null, move.vertical === 'up' ? t('plots.toUp') : move.vertical === 'down' ? t('plots.toDown') : null]
  return t('plots.sightHint', { directions: parts.filter(Boolean).join(t('plots.sightAnd')) })
}
// The score of the plotted arrows next to what it would be with the group centre in the middle. Not for small groups.
const centredText = (block: { plotted: { x: number; y: number }[]; typed: number }, face: Parameters<typeof centredScore>[0]) => {
  const result = centredScore(face, block.plotted)
  if (!result) return null
  const diff = result.centred - result.real
  return {
    line: t('plots.centred', { real: result.real, centred: result.centred, diff: diff > 0 ? `+${diff}` : String(diff) }),
    partial: block.typed > 0 ? t('plots.centredPartial', { n: result.n }) : '',
  }
}
const hasNumbers = (plotted: { arrow_number?: number }[]) => plotted.some((s) => s.arrow_number != null)
</script>

<template>
  <div v-if="fill && current" class="d-flex flex-column gap-1" style="flex: 1 1 0; min-height: 0">
    <div v-if="blocks.length > 1 || hasNumbers(current.block.plotted)" class="d-flex flex-wrap gap-2">
      <IonChip
        v-for="(b, i) in blocks"
        :key="b.block.key"
        class="m-0 chip"
        :outline="blocks.indexOf(current) !== i"
        :class="{ selected: blocks.indexOf(current) === i }"
        @click="shown = i"
      >
        {{ formatDistance(b.block.distance_m) }} · {{ b.face.name }}
      </IonChip>
      <IonChip v-if="hasNumbers(current.block.plotted)" class="m-0 chip" :outline="!showNumbers" :class="{ selected: showNumbers }" @click="showNumbers = !showNumbers">
        {{ $t('plots.numbers') }}
      </IonChip>
    </div>
    <div class="fw-semibold">{{ formatDistance(current.block.distance_m) }} · {{ current.face.name }} · {{ $t('count.arrows', current.block.plotted.length + current.block.typed) }}</div>
    <FaceView v-if="current.block.plotted.length > 0" fill :face="current.face" :shots="current.block.plotted" :numbers="showNumbers" />
    <div v-else class="flex-grow-1"></div>
    <div v-for="{ spot, group } in current.block.groups" :key="spot" class="muted">
      {{ $t('plots.summary', { label: current.face.spots.length > 1 ? $t('plots.spot', { n: spot + 1 }) : $t('plots.group'), centre: describeCentre(group, current.radius, words, units), spread: formatLength(spreadCm(group, current.radius)) }) }}
    </div>
    <div v-if="centredText(current.block, current.face)" class="muted">
      {{ centredText(current.block, current.face)!.line }} {{ centredText(current.block, current.face)!.partial }}
      <div class="faint">{{ $t('plots.centredHint') }}</div>
    </div>
    <div v-if="sightText(current.block.plotted, current.radius)" class="muted">{{ sightText(current.block.plotted, current.radius) }}</div>
    <div v-if="current.block.typed > 0" class="faint">{{ $t('plots.typedShort', { n: current.block.typed }) }}</div>
  </div>
  <div v-else-if="blocks.length > 0" class="d-flex flex-column gap-3">
    <div v-for="{ block, face, radius } in blocks" :key="block.key" class="d-flex flex-column gap-1">
      <div class="fw-semibold">{{ formatDistance(block.distance_m) }} · {{ face.name }} · {{ $t('count.arrows', block.plotted.length + block.typed) }}</div>
      <IonChip v-if="hasNumbers(block.plotted)" class="m-0 chip align-self-start" :outline="!showNumbers" :class="{ selected: showNumbers }" @click="showNumbers = !showNumbers">
        {{ $t('plots.numbers') }}
      </IonChip>
      <FaceView v-if="block.plotted.length > 0" :face="face" :shots="block.plotted" :numbers="showNumbers" />
      <div v-for="{ spot, group } in block.groups" :key="spot">
        {{ $t('plots.summary', { label: face.spots.length > 1 ? $t('plots.spot', { n: spot + 1 }) : $t('plots.group'), centre: describeCentre(group, radius, words, units), spread: formatLength(spreadCm(group, radius)) }) }}
        ({{ $t('count.arrows', group.n) }})
      </div>
      <div v-if="centredText(block, face)">
        {{ centredText(block, face)!.line }} {{ centredText(block, face)!.partial }}
        <div class="faint">{{ $t('plots.centredHint') }}</div>
      </div>
      <div v-if="sightText(block.plotted, radius)">{{ sightText(block.plotted, radius) }}</div>
      <div v-if="block.typed > 0" class="faint">
        {{ $t('plots.typed', { n: block.typed }, block.typed) }}
      </div>
    </div>
  </div>
</template>
