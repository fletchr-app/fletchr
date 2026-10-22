<script setup lang="ts">
import { IonToggle } from '@ionic/vue'
import { ref } from 'vue'

import ErrorText from '@/components/ErrorText.vue'
import { useAuth } from '@/composables/useAuth'
import type { components } from '@/lib/api-types'

// Coaches who also shoot can let the other coaches of the team see their training. Off until they turn it on.
const props = defineProps<{ team: components['schemas']['Team'] }>()
const { api } = useAuth()
const shared = ref(props.team.also_shoots)
const error = ref<string | null>(null)

async function change(next: boolean) {
  shared.value = next
  error.value = null
  try {
    const { data } = await api.PATCH('/api/teams/{team_id}/membership/', { params: { path: { team_id: props.team.id } }, body: { also_shoots: next } })
    if (!data) throw new Error('refused')
  } catch {
    shared.value = !next
    error.value = 'Could not save this setting'
  }
}
</script>

<template>
  <div>
    <IonToggle :checked="shared" class="ion-text-wrap" @ion-change="change($event.detail.checked)">Show my own training to the other coaches of this team</IonToggle>
    <ErrorText :message="error" />
  </div>
</template>
