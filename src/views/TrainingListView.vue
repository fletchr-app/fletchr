<script setup lang="ts">
import { IonList } from '@ionic/vue'

import AppButton from '@/components/AppButton.vue'
import AppPage from '@/components/AppPage.vue'
import { computed } from 'vue'

import ErrorText from '@/components/ErrorText.vue'
import SessionListItem from '@/components/SessionListItem.vue'
import SyncBanner from '@/components/SyncBanner.vue'
import { useAuth } from '@/composables/useAuth'
import { useLog } from '@/composables/useLog'
import { useRemote } from '@/composables/useRemote'
import { sessionRows } from '@/lib/session-rows'

const REFRESH_MS = 15000

const { api, userId, isLocal } = useAuth()
const { sessions: local, goneSessions } = useLog()
const remote = useRemote(async () => (isLocal.value ? [] : ((await api.GET('/api/sessions/', { params: { query: { owner: Number(userId.value) } } })).data ?? null)), {
  pollMs: REFRESH_MS,
  keepPolling: () => !isLocal.value,
})

// Trainings of your team with notes or photos of yours and no session of yours: they show between the sessions.
const events = useRemote(async () => (isLocal.value ? [] : ((await api.GET('/api/events/mine/', { params: { query: { archer: Number(userId.value) } } })).data ?? null)), {
  pollMs: REFRESH_MS,
  keepPolling: () => !isLocal.value,
})

// Your own sessions. Ones a coach logged for an archer (owner set) are on that archer's page.
const rows = computed(() => sessionRows(local.value.filter((s) => !s.owner), remote.data.value ?? [], goneSessions.value, events.data.value ?? [], Number(userId.value)))
</script>

<template>
  <AppPage :title="$t('training.title')" :back="false">
    <div class="screen">
      <SyncBanner />
      <AppButton router-link="/training/new">{{ $t('training.start') }}</AppButton>
      <ErrorText :message="remote.error.value" />
      <IonList v-if="rows.length > 0" inset>
        <SessionListItem v-for="row in rows" :key="row.id" :row="row" />
      </IonList>
    </div>
  </AppPage>
</template>
