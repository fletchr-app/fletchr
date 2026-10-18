<script setup lang="ts" generic="T extends string">
defineProps<{ label: string; options: { value: T; label: string }[] }>()
const model = defineModel<T>({ required: true })
</script>

<template>
  <div>
    <div class="fw-semibold mb-1">{{ label }}</div>
    <div class="d-flex flex-wrap gap-2">
      <button
        v-for="option in options"
        :key="option.value"
        type="button"
        class="btn btn-sm rounded-pill"
        :class="model === option.value ? 'btn-primary' : 'btn-secondary'"
        @click="model = option.value"
      >
        {{ option.label }}
      </button>
    </div>
  </div>
</template>
