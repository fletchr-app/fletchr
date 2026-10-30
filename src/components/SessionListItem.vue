<script setup lang="ts">
import { IonItem, IonLabel } from '@ionic/vue'

import { eventTitle } from '@/lib/schedule'
import { sessionTypeKey } from '@/lib/log-model'
import type { SessionRow } from '@/lib/session-rows'

// One session in a list: when, what, where, and how it went. Opens the session. A team training without a session of the archer opens the training.
defineProps<{ row: SessionRow; lines?: 'full' | 'none' }>()
const titleOf = (name: string, kind: string) => eventTitle({ name, kind: kind as 'training' })
</script>

<template>
  <IonItem :router-link="row.to" detail :lines="lines ?? 'full'">
    <IonLabel v-if="row.event" class="ion-text-wrap">
      <h3>{{ new Date(row.started_at).toLocaleDateString() }} · {{ titleOf(row.event.name, row.event.kind).startsWith('event.kind.') ? $t(titleOf(row.event.name, row.event.kind)) : row.event.name }}</h3>
      <p>{{ row.location ? `${row.location} · ` : '' }}{{ $t('event.counts', { notes: $t('count.notes', row.event.notes), media: $t('count.media', row.event.media) }) }}</p>
    </IonLabel>
    <IonLabel v-else class="ion-text-wrap">
      <h3>{{ new Date(row.started_at).toLocaleString() }} · {{ $t(sessionTypeKey(row.type)) }}{{ row.finished ? '' : ` (${$t('training.inProgress')})` }}</h3>
      <p>
        {{ row.location ? `${row.location} · ` : '' }}{{ $t('count.ends', row.ends) }} · {{ $t('count.arrows', row.arrows) }}{{ row.ends > 0 ? ` · ${$t('count.points', row.points)}` : '' }}
      </p>
    </IonLabel>
  </IonItem>
</template>
