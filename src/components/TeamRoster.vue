<script setup lang="ts">
import { IonItem, IonLabel } from '@ionic/vue'

import AppAvatar from '@/components/AppAvatar.vue'
import ErrorText from '@/components/ErrorText.vue'
import { useAuth } from '@/composables/useAuth'
import { useRemote } from '@/composables/useRemote'

// Who is in the team, as the other members see them: name, role and picture (what each person allows, Settings). No addresses.
const props = defineProps<{ teamId: number }>()
const { api, userId } = useAuth()
// Not polled: every answer carries new picture links, which would download the pictures again.
const { data, error } = useRemote(async () => (await api.GET('/api/teams/{team_id}/roster/', { params: { path: { team_id: props.teamId } } })).data ?? null)
</script>

<template>
  <div class="d-flex flex-column gap-2">
    <h3 class="h6 m-0">{{ $t('team.roster') }}</h3>
    <ErrorText :message="error" />
    <div v-for="m in data ?? []" :key="m.user_id">
      <IonItem :detail="false" lines="full">
        <AppAvatar slot="start" :name="m.name || $t('team.noName')" :url="m.avatar_url" />
        <IonLabel class="ion-text-wrap">
          <h3>{{ m.name || $t('team.noName') }}{{ String(m.user_id) === String(userId) ? ` (${$t('teams.you')})` : '' }}</h3>
          <p>{{ $t(`roles.${m.role}`) }}</p>
        </IonLabel>
      </IonItem>
    </div>
  </div>
</template>
