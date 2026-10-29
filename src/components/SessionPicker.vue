<script setup lang="ts">
import { IonButton, IonButtons, IonContent, IonHeader, IonItem, IonLabel, IonList, IonModal, IonTitle, IonToolbar } from '@ionic/vue'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import AppButton from '@/components/AppButton.vue'
import { useAuth } from '@/composables/useAuth'
import { useLog } from '@/composables/useLog'
import { pickerOrder } from '@/lib/media-move'
import { sessionTypeKey } from '@/lib/log-model'

const props = defineProps<{
  open: boolean
  /** The archer the photos and videos belong to. */
  owner: number
  /** When the first of them was taken: the session around that time comes first. */
  takenAt: string
  /** The session they are in now, if they are all in the same one. */
  current: string | null
  /** At least one of them is on the server already, so it can not go into a session that is still waiting to be uploaded. */
  serverItems: boolean
  /** Offer "Remove from session". */
  removable: boolean
}>()
const emit = defineEmits<{ close: []; pick: [session: string | null] }>()

const DAY_MS = 86_400_000
const WINDOW_DAYS = 30

type Row = { id: string; started_at: string; ended_at: string | null; type: string; location: string }

const { t } = useI18n()
const { api, userId } = useAuth()
const log = useLog()
const days = ref(WINDOW_DAYS)
const remote = ref<Row[]>([])
const failed = ref(false)

// The local log works offline and knows the sessions that are still on their way; the server adds those of other devices.
const local = computed<Row[]>(() =>
  log.sessions.value
    .filter((s) => (s.owner ?? Number(userId.value)) === props.owner)
    .map((s) => ({ id: s.id, started_at: s.started_at, ended_at: s.ended_at, type: s.type, location: s.location })),
)
const rows = computed(() => {
  const byId = new Map<string, Row>()
  for (const s of [...remote.value, ...local.value]) byId.set(s.id, s)
  const taken = new Date(props.takenAt).getTime()
  const near = [...byId.values()].filter((s) => Math.abs(new Date(s.started_at).getTime() - taken) <= days.value * DAY_MS)
  return pickerOrder(near, props.takenAt)
})

async function load() {
  const taken = new Date(props.takenAt).getTime()
  failed.value = false
  try {
    const { data } = await api.GET('/api/sessions/', {
      params: {
        query: {
          owner: props.owner,
          started_after: new Date(taken - days.value * DAY_MS).toISOString(),
          started_before: new Date(taken + days.value * DAY_MS).toISOString(),
        },
      },
    })
    if (data) remote.value = data.map((s) => ({ id: s.id, started_at: s.started_at, ended_at: s.ended_at ?? null, type: s.type ?? '', location: s.location ?? '' }))
    else failed.value = true
  } catch {
    failed.value = true // offline: the sessions on the phone are still there
  }
}
watch(() => props.open, (open) => open && void load(), { immediate: true })

const showOlder = () => {
  days.value *= 4
  void load()
}
const waits = (id: string) => props.serverItems && log.sessionWaiting(id)
const title = (s: Row) => `${new Date(s.started_at).toLocaleString()}${s.ended_at ? '' : ` · ${t('training.inProgress')}`}`
</script>

<template>
  <IonModal :is-open="open" :initial-breakpoint="0.7" :breakpoints="[0, 0.7, 1]" @did-dismiss="emit('close')">
    <IonHeader>
      <IonToolbar>
        <IonTitle>{{ $t('media.pickSession') }}</IonTitle>
        <IonButtons slot="end"><IonButton @click="emit('close')">{{ $t('media.close') }}</IonButton></IonButtons>
      </IonToolbar>
    </IonHeader>
    <IonContent>
      <IonList>
        <IonItem v-for="s in rows" :key="s.id" button :detail="false" :disabled="s.id === current || waits(s.id)" @click="emit('pick', s.id)">
          <IonLabel>
            <h3>{{ title(s) }}</h3>
            <p>
              {{ $t(sessionTypeKey(s.type)) }}{{ s.location ? ` · ${s.location}` : '' }}
              <template v-if="s.id === current"> · {{ $t('media.currentSession') }}</template>
              <template v-else-if="waits(s.id)"> · {{ $t('media.sessionWaiting') }}</template>
            </p>
          </IonLabel>
        </IonItem>
      </IonList>
      <div class="screen">
        <div v-if="rows.length === 0" class="muted">{{ $t('media.noSessions') }}</div>
        <div v-if="failed" class="muted">{{ $t('common.serverNotReachable') }}</div>
        <AppButton secondary @click="showOlder">{{ $t('media.showOlder') }}</AppButton>
        <AppButton v-if="removable" secondary @click="emit('pick', null)">{{ $t('media.removeFromSession') }}</AppButton>
      </div>
    </IonContent>
  </IonModal>
</template>
