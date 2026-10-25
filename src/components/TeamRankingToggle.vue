<script setup lang="ts">
import { IonToggle } from '@ionic/vue'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

import ErrorText from '@/components/ErrorText.vue'
import { useAuth } from '@/composables/useAuth'

// Admins decide whether coaches get a table that puts the archers in order. Off by default, for teams of young archers.
const props = defineProps<{ teamId: number; on: boolean }>()
const emit = defineEmits<{ changed: [] }>()
const { t } = useI18n()
const { api } = useAuth()
const shown = ref(props.on)
const error = ref<string | null>(null)

async function change(next: boolean) {
  if (next === shown.value) return
  shown.value = next
  error.value = null
  try {
    const { data } = await api.PATCH('/api/teams/{team_id}/', { params: { path: { team_id: props.teamId } }, body: { show_ranking: next } })
    if (!data) throw new Error('refused')
    emit('changed')
  } catch {
    shown.value = !next
    error.value = t('ranking.switchFailed')
  }
}
</script>

<template>
  <div>
    <IonToggle :checked="shown" class="ion-text-wrap" @ion-change="change($event.detail.checked)">{{ $t('ranking.switch') }}</IonToggle>
    <div class="faint">{{ $t('ranking.switchHint') }}</div>
    <ErrorText :message="error" />
  </div>
</template>
