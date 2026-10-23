<script setup lang="ts">
import { IonItem, IonLabel, IonList } from '@ionic/vue'

import AddArcher from '@/components/AddArcher.vue'
import AppButton from '@/components/AppButton.vue'

import ErrorText from '@/components/ErrorText.vue'
import ShareTraining from '@/components/ShareTraining.vue'
import { useAuth } from '@/composables/useAuth'
import { useRemote } from '@/composables/useRemote'
import type { components } from '@/lib/api-types'

const REFRESH_MS = 10000

const props = defineProps<{ team: components['schemas']['Team'] }>()
const { api } = useAuth()
const { data, error, reload } = useRemote(
  async () => (await api.GET('/api/teams/{team_id}/overview/', { params: { path: { team_id: props.team.id } } })).data ?? null,
  { pollMs: REFRESH_MS, keepPolling: () => true },
)
</script>

<template>
  <div class="d-flex flex-column gap-2">
    <h2 class="h5 m-0">{{ team.name }}</h2>
    <AppButton secondary :router-link="`/team/${team.id}`">{{ team.my_role === 'admin' ? $t('teams.manage') : $t('teams.members') }}</AppButton>
    <ShareTraining :team="team" />
    <AddArcher :team-id="team.id" @added="reload" />
    <ErrorText :message="error" />
    <div v-if="data?.length === 0">{{ $t('teams.noArchers') }}</div>
    <IonList v-if="data?.length" inset>
      <IonItem
        v-for="archer in data"
        :key="archer.user_id"
        :router-link="`/archers/${archer.user_id}?name=${encodeURIComponent(archer.name)}`"
        detail
        lines="full"
      >
        <IonLabel class="ion-text-wrap">
          <h3>{{ archer.name }}{{ archer.role !== 'archer' ? ` (${$t('teams.coachSuffix')})` : '' }}{{ archer.managed ? ` (${$t('teams.noAccount')})` : '' }}{{ archer.last_session?.live ? `  ● ${$t('teams.shootingNow')}` : '' }}</h3>
          <p>
            {{ archer.last_session ? $t('teams.lastSession', { date: new Date(archer.last_session.started_at).toLocaleDateString(), type: $t(`sessionType.${archer.last_session.type}`) }) : $t('teams.noSessions') }} ·
            {{ $t('teams.arrows7d', { n: archer.arrows_7d }, archer.arrows_7d) }}
          </p>
        </IonLabel>
      </IonItem>
    </IonList>
  </div>
</template>
