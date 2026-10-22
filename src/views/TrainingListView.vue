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
import { sessionTotals } from '@/lib/log-model'

const REFRESH_MS = 15000

type Row = {
  id: string
  to: string
  started_at: string
  type: string
  location: string
  finished: boolean
  ends: number
  arrows: number
  points: number
}

const { api, userId } = useAuth()
const { sessions: local } = useLog()
const remote = useRemote(async () => (await api.GET('/api/sessions/', { params: { query: { owner: Number(userId.value) } } })).data ?? null, {
  pollMs: REFRESH_MS,
  keepPolling: () => true,
})

// Sessions on this device can be edited. Others (from another device) are shown as the server has them.
const rows = computed<Row[]>(() =>
  [
    ...local.value.map((s) => {
      const { arrows, score } = sessionTotals(s)
      return { id: s.id, to: `/training/${s.id}`, started_at: s.started_at, type: s.type, location: s.location, finished: !!s.ended_at, ends: s.ends.length, arrows, points: score }
    }),
    ...(remote.data.value ?? [])
      .filter((s) => !local.value.some((l) => l.id === s.id))
      .map((s) => ({
        id: s.id, to: `/sessions/${s.id}`, started_at: s.started_at, type: s.type, location: s.location ?? '',
        finished: !!s.ended_at, ends: s.ends, arrows: s.scored_arrows + s.volume_arrows, points: s.score_total,
      })),
  ].sort((a, b) => b.started_at.localeCompare(a.started_at)),
)
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
