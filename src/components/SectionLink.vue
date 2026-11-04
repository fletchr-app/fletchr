<script setup lang="ts">
import { IonIcon } from '@ionic/vue'
import { add as addIcon, chevronForward } from 'ionicons/icons'
import type { RouteLocationRaw } from 'vue-router'

// The icons at the right of a section heading: a plus that adds to the section, an arrow that opens the rest of it.
defineProps<{ to?: RouteLocationRaw; add?: RouteLocationRaw; addLabel?: string }>()
</script>

<template>
  <div class="d-flex align-items-center">
    <router-link v-if="add" :to="add" :aria-label="addLabel" class="section-icon"><IonIcon :icon="addIcon" /></router-link>
    <router-link v-if="to" :to="to" :aria-label="$t('common.showAll')" class="section-icon"><IonIcon :icon="chevronForward" /></router-link>
  </div>
</template>

<style scoped>
.section-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 32px;
  font-size: 22px;
  color: var(--ion-color-primary);
}
.section-icon:last-child {
  margin-right: -6px;
}
</style>
