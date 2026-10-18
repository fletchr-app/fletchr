<script setup lang="ts">
defineProps<{ message?: string | null }>()
</script>

<template>
  <div v-if="message" class="text-danger" role="alert">{{ message }}</div>
</template>
