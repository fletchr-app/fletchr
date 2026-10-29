<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import ChipGroup from '@/components/ChipGroup.vue'
import type { Equipment } from '@/lib/log-model'

const props = defineProps<{ equipment: Equipment; bowKey: string | null; arrowSetKey: string | null }>()
const emit = defineEmits<{ change: [bowKey: string | null, arrowSetKey: string | null] }>()

const { t } = useI18n()
const none = computed(() => ({ value: '', label: t('gear.none') }))
</script>

<!-- Choose the bow and arrow set from the copy of your equipment on this device. Arrows are offered once a bow is chosen. -->
<template>
  <div v-if="equipment.bows.length === 0" class="faint">
    {{ $t('gear.noBows') }}
  </div>
  <template v-else>
    <ChipGroup
      :label="$t('gear.bow')"
      :options="[none, ...equipment.bows.map((b) => ({ value: b.key, label: b.name }))]"
      :model-value="bowKey ?? ''"
      @update:model-value="(v) => emit('change', v === '' ? null : v, v === '' ? null : props.arrowSetKey)"
    />
    <ChipGroup
      v-if="bowKey !== null && equipment.arrowSets.length > 0"
      :label="$t('gear.arrowSet')"
      :options="[none, ...equipment.arrowSets.map((a) => ({ value: a.key, label: a.name }))]"
      :model-value="arrowSetKey ?? ''"
      @update:model-value="(v) => emit('change', props.bowKey, v === '' ? null : v)"
    />
  </template>
</template>
