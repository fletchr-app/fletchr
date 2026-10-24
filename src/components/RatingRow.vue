<script setup lang="ts">
import { ratings } from '@/lib/evaluation'

// 1 to `scale` as buttons; a second tap on the chosen one takes the rating back.
const props = defineProps<{ scale: number; label: string }>()
const model = defineModel<number | null>({ required: true })
const pick = (n: number) => (model.value = model.value === n ? null : n)
</script>

<template>
  <div class="rating" role="group" :aria-label="label">
    <button v-for="n in ratings(props.scale)" :key="n" type="button" :class="{ on: model === n }" :aria-pressed="model === n" @click="pick(n)">{{ n }}</button>
  </div>
</template>

<style scoped>
.rating {
  display: flex;
  gap: 6px;
}
button {
  flex: 1;
  height: 44px;
  border: 1px solid color-mix(in srgb, currentcolor 30%, transparent);
  border-radius: 22px;
  background: transparent;
  color: inherit;
  font-size: 1.05rem;
  font-weight: 600;
}
button.on {
  background: var(--ion-color-primary);
  border-color: var(--ion-color-primary);
  color: var(--ion-color-primary-contrast);
}
</style>
