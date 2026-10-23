<script setup lang="ts">
import { IonChip } from '@ionic/vue'

// A rating from 1 to 5. Tapping the chosen number again clears it, so a rating can be left out.
defineProps<{ label: string }>()
const model = defineModel<number | null>({ required: true })
</script>

<template>
  <div>
    <div class="fw-semibold mb-1">{{ label }}</div>
    <div class="d-flex gap-1">
      <IonChip
        v-for="n in 5"
        :key="n"
        class="m-0 chip"
        :outline="model !== n"
        :class="{ selected: model === n }"
        :aria-label="`${label} ${n}`"
        @click="model = model === n ? null : n"
      >
        {{ n }}
      </IonChip>
    </div>
  </div>
</template>
