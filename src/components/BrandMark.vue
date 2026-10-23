<script setup lang="ts">
// The Fletchr mark: an arrow with orange fletching in front of a target. The arrow and the rings follow the text
// colour, so it reads on the light and the dark app bar. Drawn like resources/generate.py draws the icon.
defineProps<{ size?: number }>()
const FLETCHING = [26, 54].flatMap((x) => [-1, 1].map((s) => `${x + 20},100 ${x},${100 + s * 22} ${x + 17},${100 + s * 22} ${x + 37},100`))
</script>

<template>
  <svg viewBox="4 4 192 192" :width="size ?? 28" :height="size ?? 28" role="img" :aria-label="$t('tabs.brand')" class="brand-mark">
    <circle cx="100" cy="100" r="70" fill="none" stroke="currentColor" stroke-width="8" opacity="0.3" />
    <circle cx="100" cy="100" r="36" fill="none" stroke="currentColor" stroke-width="8" opacity="0.3" />
    <g transform="rotate(-45 100 100)">
      <rect x="30" y="95.5" width="128" height="9" rx="4.5" fill="currentColor" />
      <polygon points="148,79 194,100 148,121 158,100" fill="currentColor" />
      <polygon v-for="p in FLETCHING" :key="p" :points="p" fill="#f4a340" />
    </g>
  </svg>
</template>

<style scoped>
.brand-mark {
  color: var(--ion-text-color, currentColor);
  flex: none;
}
</style>
