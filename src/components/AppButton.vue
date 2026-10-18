<script setup lang="ts">
defineProps<{ busy?: boolean; secondary?: boolean }>()
</script>

<template>
  <button type="button" class="btn w-100" :class="secondary ? 'btn-secondary' : 'btn-primary'" :disabled="busy">
    <span v-if="busy" class="spinner-border spinner-border-sm" role="status"></span>
    <slot v-else />
  </button>
</template>
