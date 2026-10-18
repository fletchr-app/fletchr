<script setup lang="ts">
import { computed, watch } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'

import { useAuth } from '@/composables/useAuth'
import { titleOverride } from '@/composables/usePageTitle'

const route = useRoute()
const router = useRouter()
const { status } = useAuth()

// Signing in or out moves you to the right side of the app, wherever you were.
watch(status, (s) => {
  if (s === 'signedOut' && route.meta.auth === 'in') void router.replace('/sign-in')
  if (s === 'signedIn' && route.meta.auth === 'out') void router.replace('/')
})

const title = computed(() => titleOverride.value ?? route.meta.title ?? 'Archery Coach')
const canGoBack = computed(() => route.path !== '/' && route.path !== '/sign-in')

function back() {
  if (window.history.state?.back) router.back()
  else void router.replace(status.value === 'signedIn' ? '/' : '/sign-in')
}
</script>

<template>
  <header class="app-header">
    <div class="bar d-flex align-items-center gap-2 px-2">
      <button v-if="canGoBack" type="button" class="btn btn-link p-2" aria-label="Back" @click="back">
        <i class="bi bi-chevron-left"></i>
      </button>
      <h1 class="h5 m-0 flex-grow-1 text-truncate" :class="{ 'ps-2': !canGoBack }">{{ title }}</h1>
      <RouterLink v-if="status === 'signedOut' && route.path !== '/settings'" to="/settings" class="btn btn-link p-2" aria-label="Server settings">
        <i class="bi bi-gear"></i>
      </RouterLink>
    </div>
  </header>
  <RouterView v-if="status !== 'loading'" :key="route.fullPath" />
</template>
