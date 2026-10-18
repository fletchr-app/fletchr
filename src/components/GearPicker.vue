<script setup lang="ts">
import ChipGroup from '@/components/ChipGroup.vue'
import type { Equipment } from '@/lib/log-model'

const props = defineProps<{ equipment: Equipment; bowId: number | null; arrowSetId: number | null }>()
const emit = defineEmits<{ change: [bowId: number | null, arrowSetId: number | null] }>()

const none = { value: '', label: 'None' }
</script>

<!-- Choose the bow and arrow set from the copy of your equipment on this device. Arrows are offered once a bow is chosen. -->
<template>
  <div v-if="equipment.bows.length === 0" class="faint">
    No bows on this device yet. Add them under Equipment, with a connection, and they will be here next time.
  </div>
  <template v-else>
    <ChipGroup
      label="Bow"
      :options="[none, ...equipment.bows.map((b) => ({ value: String(b.id), label: b.name }))]"
      :model-value="bowId === null ? '' : String(bowId)"
      @update:model-value="(v) => emit('change', v === '' ? null : Number(v), v === '' ? null : props.arrowSetId)"
    />
    <ChipGroup
      v-if="bowId !== null && equipment.arrowSets.length > 0"
      label="Arrow set"
      :options="[none, ...equipment.arrowSets.map((a) => ({ value: String(a.id), label: a.name }))]"
      :model-value="arrowSetId === null ? '' : String(arrowSetId)"
      @update:model-value="(v) => emit('change', props.bowId, v === '' ? null : Number(v))"
    />
  </template>
</template>
