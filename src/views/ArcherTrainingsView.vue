<script setup lang="ts">
import { IonList } from '@ionic/vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'

import AppPage from '@/components/AppPage.vue'
import ErrorText from '@/components/ErrorText.vue'
import SessionListItem from '@/components/SessionListItem.vue'
import { useArcherSessions } from '@/composables/useArcherSessions'

// All sessions of one archer, for their coach. The profile shows only the latest.
const route = useRoute()
const id = Number(route.params.id)
const name = route.query.name as string | undefined
const { t } = useI18n()
const title = computed(() => (name ? t('archer.trainingsOf', { name }) : t('archer.trainings')))
const { rows, error, loading } = useArcherSessions(id)
</script>

<template>
  <AppPage :title="title">
    <div class="screen">
      <ErrorText :message="error" />
      <div v-if="loading">{{ $t('common.loading') }}</div>
      <div v-else-if="rows.length === 0">{{ $t('archer.noSessions') }}</div>
      <IonList v-else inset>
        <SessionListItem v-for="row in rows" :key="row.id" :row="row" />
      </IonList>
    </div>
  </AppPage>
</template>
