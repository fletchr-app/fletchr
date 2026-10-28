<script setup lang="ts">
import { IonAvatar } from '@ionic/vue'
import { computed, ref, watch } from 'vue'

import { initials } from '@/lib/avatar'

// The picture of a person, or their initials when there is none (or the link has run out: it opens for an hour, the next load gives a new one).
const props = withDefaults(defineProps<{ name: string; url?: string; size?: number }>(), { url: '', size: 40 })
const broken = ref(false)
watch(() => props.url, () => (broken.value = false))
const letters = computed(() => initials(props.name))
</script>

<template>
  <IonAvatar class="app-avatar" :style="{ '--size': `${size}px` }">
    <img v-if="url && !broken" :src="url" :alt="$t('avatar.alt', { name })" @error="broken = true" />
    <span v-else class="app-avatar-initials" aria-hidden="true" :style="{ fontSize: `${size * 0.4}px` }">{{ letters }}</span>
  </IonAvatar>
</template>

<style scoped>
.app-avatar {
  flex: none;
}
.app-avatar img {
  object-fit: cover;
}
.app-avatar-initials {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  font-weight: 600;
  color: var(--app-avatar-text, #fff);
  background: var(--app-avatar-bg, #6b7a90);
}
</style>
