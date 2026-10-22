<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import EndEditor from '@/components/EndEditor.vue'
import { useLog } from '@/composables/useLog'

// The arrow entry for one end. The settings come from the setup screen in the query.
const route = useRoute()
const router = useRouter()
const { loaded, sessions } = useLog()

const session = computed(() => sessions.value.find((s) => s.id === route.params.id))
const editing = session.value?.ends.find((e) => e.id === route.query.end) ?? null
const arrows = Math.max(1, Math.min(12, Math.round(Number(route.query.arrows)) || 3))

// Back to the session overview, without leaving it twice in the history.
function done() {
  const overview = `/training/${route.params.id}`
  if (window.history.state?.back === overview) router.back()
  else void router.replace(overview)
}
</script>

<template>
  <div v-if="!session" class="screen">{{ loaded ? 'This session is not on this device.' : 'Loading…' }}</div>
  <EndEditor
    v-else
    :session="session"
    :editing="editing"
    :distance="String(route.query.distance ?? '')"
    :face="String(route.query.face ?? '')"
    :arrows="arrows"
    @done="done"
  />
</template>
