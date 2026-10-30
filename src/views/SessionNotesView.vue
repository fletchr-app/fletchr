<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

import AppPage from '@/components/AppPage.vue'
import NotesSection from '@/components/NotesSection.vue'
import { useAuth } from '@/composables/useAuth'
import { useLog } from '@/composables/useLog'

// Notes on a session kept on this device: your own, and those of coaches. A note written before the session
// is on the server waits for it in the upload queue.
const route = useRoute()
const { userId } = useAuth()
const { loaded, sessions } = useLog()
const sessionId = route.params.id as string
const session = computed(() => sessions.value.find((s) => s.id === sessionId))
</script>

<template>
  <AppPage :title="$t('notes.title')">
    <div v-if="!session" class="screen">{{ loaded ? $t('session.notOnDevice') : $t('common.loading') }}</div>
    <div v-else class="screen">
      <NotesSection :archer-id="session.owner ?? Number(userId)" :session-id="session.id" :ends="session.ends" />
    </div>
  </AppPage>
</template>
