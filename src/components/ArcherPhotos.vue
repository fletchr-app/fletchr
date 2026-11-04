<script setup lang="ts">
import { IonIcon } from '@ionic/vue'
import { playCircleOutline } from 'ionicons/icons'
import { computed } from 'vue'

import ErrorText from '@/components/ErrorText.vue'
import SectionLink from '@/components/SectionLink.vue'
import { useAuth } from '@/composables/useAuth'
import { useRemote } from '@/composables/useRemote'

const SHOWN = 6

// The latest photos and clips of an archer, newest first; the media page has the rest.
const props = defineProps<{ archerId: number; name: string }>()
const { api } = useAuth()
const media = useRemote(async () => (await api.GET('/api/media/', { params: { query: { owner: props.archerId } } })).data ?? null)
const latest = computed(() => (media.data.value ?? []).slice(0, SHOWN))
</script>

<template>
  <div class="d-flex flex-column gap-2">
    <div class="d-flex align-items-center justify-content-between">
      <h2 class="h5 m-0">{{ $t('archer.latestPhotos') }}</h2>
      <SectionLink
        :add="`/media?owner=${archerId}&name=${encodeURIComponent(name)}&add=1`"
        :add-label="$t('media.add')"
        :to="latest.length ? `/media?owner=${archerId}&name=${encodeURIComponent(name)}` : undefined"
      />
    </div>
    <ErrorText :message="media.error.value" />
    <div v-if="media.data.value && latest.length === 0">{{ $t('media.empty') }}</div>
    <div v-else class="grid">
      <router-link v-for="m in latest" :key="m.id" :to="{ path: `/media/${m.id}`, query: { owner: String(archerId) } }" class="cell">
        <img :src="m.thumbnail_url" alt="" loading="lazy" />
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
