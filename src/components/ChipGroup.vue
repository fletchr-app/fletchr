<script setup lang="ts" generic="T extends string">
import { IonChip } from '@ionic/vue'

defineProps<{ label: string; options: { value: T; label: string }[] }>()
const model = defineModel<T>({ required: true })
</script>

<template>
  <div>
    <div class="fw-semibold mb-1">{{ label }}</div>
    <div class="d-flex flex-wrap gap-1">
      <IonChip
        v-for="option in options"
        :key="option.value"
        class="m-0 chip"
        :outline="model !== option.value"
        :class="{ selected: model === option.value }"
        @click="model = option.value"
      >
        {{ option.label }}
      </IonChip>
    </div>
  </div>
</template>
