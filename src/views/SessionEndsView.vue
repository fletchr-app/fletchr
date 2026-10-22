<script setup lang="ts">
import AppPage from '@/components/AppPage.vue'
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import AppButton from '@/components/AppButton.vue'
import EndRows from '@/components/EndRows.vue'
import { useLog } from '@/composables/useLog'
import type { LogEnd } from '@/lib/log-model'

// All ends of a session, and deleting the session.
const route = useRoute()
const router = useRouter()
const { loaded, sessions, deleteSession } = useLog()
const confirmDelete = ref(false)

const sessionId = route.params.id as string
const session = computed(() => sessions.value.find((s) => s.id === sessionId))

function edit(end: LogEnd) {
  void router.push({
    path: `/training/${sessionId}/end`,
    query: { distance: end.distance_m, face: end.face, arrows: String(end.arrows_per_end), end: end.id },
  })
}

function remove() {
  deleteSession(session.value!.id)
  void router.replace('/training')
}
</script>

<template>
  <AppPage title="Ends">
    <div v-if="!session" class="screen">{{ loaded ? 'This session is not on this device.' : 'Loading…' }}</div>
    <div v-else class="screen">
      <EndRows :ends="session.ends" clickable @select="edit" />
      <AppButton secondary @click="confirmDelete ? remove() : (confirmDelete = true)">
        {{ confirmDelete ? 'Tap again to delete this session' : 'Delete session' }}
      </AppButton>
    </div>
  </AppPage>
</template>
