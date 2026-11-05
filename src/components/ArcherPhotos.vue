<script setup lang="ts">
import { IonIcon } from '@ionic/vue'
import { playCircleOutline } from 'ionicons/icons'
import type { RouteLocationRaw } from 'vue-router'

import ErrorText from '@/components/ErrorText.vue'
import SectionLink from '@/components/SectionLink.vue'
import type { Tile } from '@/lib/profile'

// The latest photos and clips, newest first; the media page has the rest.
defineProps<{ tiles: Tile[]; loaded: boolean; error: string | null; to?: RouteLocationRaw; add?: RouteLocationRaw }>()
</script>

<template>
  <div class="d-flex flex-column gap-2">
    <div class="d-flex align-items-center justify-content-between">
      <h2 class="h5 m-0">{{ $t('archer.latestPhotos') }}</h2>
      <SectionLink :add="add" :add-label="$t('media.add')" :to="to" />
    </div>
    <ErrorText :message="error" />
    <div v-if="loaded && tiles.length === 0">{{ $t('media.empty') }}</div>
    <div v-else class="grid">
      <router-link v-for="m in tiles" :key="m.id" :to="m.to" class="cell">
        <img v-if="m.src" :src="m.src" alt="" loading="lazy" />
        <IonIcon v-if="m.kind === 'video'" :icon="playCircleOutline" class="play" />
      </router-link>
    </div>
  </div>
</template>

<style scoped>
.grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
}
.cell {
  position: relative;
  display: block;
  aspect-ratio: 1;
  overflow: hidden;
  background: color-mix(in srgb, var(--ion-text-color, #000) 10%, transparent);
}
.cell img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.play {
  position: absolute;
  left: 6px;
  bottom: 6px;
  font-size: 28px;
  color: #fff;
}
</style>
