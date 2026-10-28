<script setup lang="ts">
import DrawingLayer from '@/components/DrawingLayer.vue'
import type { Shape } from '@/lib/drawing'

// A photo with the coach's drawing over it, read-only. By default as wide as its parent; the parent can give it
// another size (style), the box keeps the shape of the photo through the layer's `width` and `height`.
defineProps<{ src: string; width: number; height: number; shapes: Shape[] }>()
</script>

<template>
  <div class="drawn" :style="{ aspectRatio: `${width} / ${height}` }">
    <img :src="src" alt="" />
    <DrawingLayer :shapes="shapes" :width="width" :height="height" />
  </div>
</template>

<style scoped>
.drawn {
  position: relative;
  width: 100%;
  background: #000;
}
img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: fill;
}
</style>
