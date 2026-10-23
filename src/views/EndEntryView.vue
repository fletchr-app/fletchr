<script setup lang="ts">
import AppPage from '@/components/AppPage.vue'
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import EndEditor from '@/components/EndEditor.vue'
import { useLog } from '@/composables/useLog'

// The arrow entry for one end. The settings come from the setup screen in the query.
const route = useRoute()
const router = useRouter()
const { loaded, sessions } = useLog()

const sessionId = route.params.id as string
const session = computed(() => sessions.value.find((s) => s.id === sessionId))
const query = route.query
const editing = session.value?.ends.find((e) => e.id === query.end) ?? null
const arrows = Math.max(1, Math.min(12, Math.round(Number(query.arrows)) || 3))

// Back to the session overview, without leaving it twice in the history.
function done() {
  const overview = `/training/${sessionId}`
  if (window.history.state?.back === overview) router.back()
  else void router.replace(overview)
}
</script>

<template>
  <AppPage :title="$t('session.arrows')" fixed>
    <div v-if="!session" class="screen">{{ loaded ? $t('session.notOnDevice') : $t('common.loading') }}</div>
    <EndEditor
      v-else
      :session="session"
      :editing="editing"
      :distance="String(query.distance ?? '')"
      :face="String(query.face ?? '')"
      :arrows="arrows"
      @done="done"
    />
  </AppPage>
</template>
