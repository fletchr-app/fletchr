<script setup lang="ts">
import AppPage from '@/components/AppPage.vue'
import { computed, ref } from 'vue'
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
// The end being edited. Back and next change it without leaving the screen.
const endId = ref(typeof query.end === 'string' ? query.end : null)
const sorted = computed(() => [...(session.value?.ends ?? [])].sort((a, b) => a.index - b.index))
const editing = computed(() => sorted.value.find((e) => e.id === endId.value) ?? null)
// The new end comes after the last existing one.
const position = computed(() => (endId.value === null ? sorted.value.length : sorted.value.findIndex((e) => e.id === endId.value)))
const prev = computed(() => (position.value > 0 ? sorted.value[position.value - 1]!.id : null))
const next = computed(() => (position.value < 0 || position.value >= sorted.value.length ? null : (sorted.value[position.value + 1]?.id ?? 'new')))
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
      :key="endId ?? 'new'"
      :session="session"
      :editing="editing"
      :distance="editing ? editing.distance_m : String(query.distance ?? '')"
      :face="editing ? editing.face : String(query.face ?? '')"
      :arrows="editing ? editing.arrows_per_end : arrows"
      :prev="prev"
      :next="next"
      @go="endId = $event === 'new' ? null : $event"
      @done="done"
    />
  </AppPage>
</template>
