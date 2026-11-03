<script setup lang="ts">
import { IonItem, IonLabel, IonList, IonListHeader } from '@ionic/vue'
import AppPage from '@/components/AppPage.vue'
import SyncBanner from '@/components/SyncBanner.vue'
import { useAuth } from '@/composables/useAuth'
import { useSyncStatus } from '@/composables/useSyncStatus'

const { isLocal } = useAuth()
const { rows, conflicts } = useSyncStatus()
</script>

<template>
  <AppPage :title="$t('sync.title')">
    <div class="screen">
      <p v-if="isLocal" class="muted">{{ $t('sync.local') }}</p>
      <p v-else-if="rows.every((r) => r.waiting === 0 && r.failed.length === 0) && conflicts.length === 0" class="muted">{{ $t('sync.nothing') }}</p>
      <template v-else>
        <SyncBanner list />
        <IonList inset>
          <IonListHeader>{{ $t('sync.byKind') }}</IonListHeader>
          <IonItem v-for="r in rows.filter((r) => r.waiting > 0 || r.failed.length > 0)" :key="r.kind" lines="full">
            <IonLabel class="ion-text-wrap">
              <h3>{{ $t(`sync.kind.${r.kind}`) }}</h3>
              <p v-if="r.waiting > 0">{{ $t('sync.kindWaiting', { n: r.waiting }, r.waiting) }}</p>
              <p v-for="(error, i) in r.failed" :key="i" class="text-danger">{{ error }}</p>
            </IonLabel>
          </IonItem>
          <IonItem v-if="conflicts.length > 0" lines="none">
            <IonLabel class="ion-text-wrap">
              <h3>{{ $t('sync.kind.conflicts') }}</h3>
              <p>{{ $t('sync.kindConflicts', { n: conflicts.length }, conflicts.length) }}</p>
            </IonLabel>
          </IonItem>
        </IonList>
      </template>
    </div>
  </AppPage>
</template>
