<script setup lang="ts">
import { getFace } from '@/lib/faces'
import { endTotal, type LogEnd, shotLabel, sortedShots } from '@/lib/log-model'

const props = defineProps<{ ends: LogEnd[]; clickable?: boolean }>()
defineEmits<{ select: [end: LogEnd] }>()

const newestFirst = () => [...props.ends].reverse()
</script>

<!-- The ends of a session, newest first, each with its arrows best first and its total. -->
<template>
  <div class="d-flex flex-column gap-2">
    <component
      :is="clickable ? 'button' : 'div'"
      v-for="end in newestFirst()"
      :key="end.id"
      :type="clickable ? 'button' : undefined"
      class="text-start p-0 border-0 bg-transparent text-reset"
      @click="clickable && $emit('select', end)"
    >
      <div class="fw-semibold">End {{ end.index + 1 }} · {{ sortedShots(end.shots).map(shotLabel).join(' ') }} = {{ endTotal(end) }}</div>
      <div class="faint">{{ end.distance_m }} m · {{ getFace(end.face)?.name ?? end.face }}</div>
    </component>
  </div>
</template>
