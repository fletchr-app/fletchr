<script setup lang="ts">
import { IonItem, IonLabel } from '@ionic/vue'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import AppAvatar from '@/components/AppAvatar.vue'
import ErrorText from '@/components/ErrorText.vue'
import { useAuth } from '@/composables/useAuth'
import { useRemote } from '@/composables/useRemote'
import { useScheduleCache } from '@/composables/useScheduleCache'

// Who is in the team, as the other members see them: name, role and picture (what each person allows, Settings). No addresses.
// Without a connection the copy from the schedule cache: names and roles, no pictures (their links run out).
const props = defineProps<{ teamId: number }>()
const { api, userId } = useAuth()
const { locale } = useI18n()
const cache = useScheduleCache()
const offline = ref(false)
// Not polled: every answer carries new picture links, which would download the pictures again.
const { data, error, reload } = useRemote(async () => {
  try {
    const { data, response } = await api.GET('/api/teams/{team_id}/roster/', { params: { path: { team_id: props.teamId } } })
    if (data || response.status < 500) {
      offline.value = false
      return data ?? null
    }
  } catch {
    /* no connection: the copy below */
  }
  const copy = cache.state.value.rosters[String(props.teamId)]
  if (!cache.state.value.pulledAt || !copy) throw new Error('server not reachable')
  offline.value = true
  return copy.map((m) => ({ ...m, avatar_url: '' }))
})
// Back online (the schedule was pulled again): show the server's list.
watch(cache.pulls, () => offline.value && reload())
const savedAt = computed(() => {
  const at = cache.state.value.pulledAt
  return at ? new Date(at).toLocaleString(locale.value, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''
})
</script>

<template>
  <div class="d-flex flex-column gap-2">
    <h3 class="h6 m-0">{{ $t('team.roster') }}</h3>
    <div v-if="offline" class="muted">{{ $t('schedule.savedAsOf', { time: savedAt }) }}</div>
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
