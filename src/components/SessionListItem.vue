<script setup lang="ts">
import { IonItem, IonLabel } from '@ionic/vue'

import type { SessionRow } from '@/lib/session-rows'

// One session in a list: when, what, where, and how it went. Opens the session.
defineProps<{ row: SessionRow; lines?: 'full' | 'none' }>()
</script>

<template>
  <IonItem :router-link="row.to" detail :lines="lines ?? 'full'">
    <IonLabel class="ion-text-wrap">
      <h3>{{ new Date(row.started_at).toLocaleString() }} · {{ $t(`sessionType.${row.type}`) }}{{ row.finished ? '' : ` (${$t('training.inProgress')})` }}</h3>
      <p>
        {{ row.location ? `${row.location} · ` : '' }}{{ $t('count.ends', row.ends) }} · {{ $t('count.arrows', row.arrows) }}{{ row.ends > 0 ? ` · ${$t('count.points', row.points)}` : '' }}
      </p>
    </IonLabel>
  </IonItem>
</template>
