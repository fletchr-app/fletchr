<script setup lang="ts">
import { IonItem, IonLabel, IonList } from '@ionic/vue'

import AppButton from '@/components/AppButton.vue'
import AppPage from '@/components/AppPage.vue'
import { computed } from 'vue'
import { useRoute } from 'vue-router'

import ErrorText from '@/components/ErrorText.vue'
import NotesSection from '@/components/NotesSection.vue'
import { useAuth } from '@/composables/useAuth'
import { useRemote } from '@/composables/useRemote'

const REFRESH_MS = 10000

// The sessions of one archer, for their coach.
const route = useRoute()
const id = route.params.id as string
const name = route.query.name as string | undefined
const title = name ?? 'Archer'

const { api } = useAuth()
const { data, error, loading } = useRemote(async () => (await api.GET('/api/sessions/', { params: { query: { owner: Number(id) } } })).data ?? null, {
  pollMs: REFRESH_MS,
  keepPolling: () => true,
})
</script>

<template>
  <AppPage :title="title">
    <div class="screen">
      <AppButton secondary :router-link="`/archers/${id}/stats?name=${encodeURIComponent(name ?? '')}`">Statistics</AppButton>
      <NotesSection :archer-id="Number(id)" />
      <ErrorText :message="error" />
      <div v-if="loading">Loading…</div>
      <div v-if="data?.length === 0">No sessions yet.</div>
      <IonList v-if="data?.length" inset>
        <IonItem v-for="s in data" :key="s.id" :router-link="`/sessions/${s.id}`" detail lines="full">
          <IonLabel class="ion-text-wrap">
            <h3>{{ new Date(s.started_at).toLocaleString() }} · {{ s.type }}{{ s.ended_at ? '' : '  ● in progress' }}</h3>
            <p>
              {{ s.location ? `${s.location} · ` : '' }}{{ s.ends }} ends · {{ s.scored_arrows + s.volume_arrows }} arrows{{ s.ends > 0 ? ` · ${s.score_total} points` : '' }}
            </p>
          </IonLabel>
        </IonItem>
      </IonList>
    </div>
  </AppPage>
</template>
