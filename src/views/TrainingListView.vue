<script setup lang="ts">
import { IonItem, IonLabel, IonList } from '@ionic/vue'

import AppButton from '@/components/AppButton.vue'
import AppPage from '@/components/AppPage.vue'
import { computed } from 'vue'

import ErrorText from '@/components/ErrorText.vue'
import SyncBanner from '@/components/SyncBanner.vue'
import { useAuth } from '@/composables/useAuth'
import { useLog } from '@/composables/useLog'
import { useRemote } from '@/composables/useRemote'
import { sessionRows } from '@/lib/session-rows'

const REFRESH_MS = 15000

const { api, userId } = useAuth()
const { sessions: local } = useLog()
const remote = useRemote(async () => (await api.GET('/api/sessions/', { params: { query: { owner: Number(userId.value) } } })).data ?? null, {
  pollMs: REFRESH_MS,
  keepPolling: () => true,
})

// Your own sessions. Ones a coach logged for an archer (owner set) are on that archer's page.
const rows = computed(() => sessionRows(local.value.filter((s) => !s.owner), remote.data.value ?? []))
</script>

<template>
  <AppPage title="Training" :back="false">
    <div class="screen">
      <SyncBanner />
      <AppButton router-link="/training/new">Start a session</AppButton>
      <ErrorText :message="remote.error.value" />
      <IonList v-if="rows.length > 0" inset>
        <IonItem v-for="row in rows" :key="row.id" :router-link="row.to" detail lines="full">
          <IonLabel class="ion-text-wrap">
            <h3>{{ new Date(row.started_at).toLocaleString() }} · {{ row.type }}{{ row.finished ? '' : ' (in progress)' }}</h3>
            <p>
              {{ row.location ? `${row.location} · ` : '' }}{{ row.ends }} ends · {{ row.arrows }} arrows{{ row.ends > 0 ? ` · ${row.points} points` : '' }}
            </p>
          </IonLabel>
        </IonItem>
      </IonList>
    </div>
  </AppPage>
</template>
