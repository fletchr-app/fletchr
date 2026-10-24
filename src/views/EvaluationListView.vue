<script setup lang="ts">
import { IonItem, IonLabel, IonList, onIonViewWillEnter } from '@ionic/vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'

import AppButton from '@/components/AppButton.vue'
import AppPage from '@/components/AppPage.vue'
import ErrorText from '@/components/ErrorText.vue'
import { useAuth } from '@/composables/useAuth'
import { useRemote } from '@/composables/useRemote'
import { average } from '@/lib/evaluation'

// The evaluations of one archer, newest first: a coach's (for the archer: those that were shared) and the archer's own.
const { t } = useI18n()
const route = useRoute()
const { api, userId } = useAuth()
const archerId = Number(route.params.id)
const name = route.query.name as string | undefined
const mine = computed(() => archerId === Number(userId.value))

const list = useRemote(async () => (await api.GET('/api/evaluations/', { params: { query: { archer: archerId } } })).data ?? null)
const teams = useRemote(async () => (mine.value ? null : ((await api.GET('/api/notes/teams/', { params: { query: { archer: archerId } } })).data ?? null)))
let first = true
onIonViewWillEnter(() => (first ? (first = false) : list.reload()))

const canCoach = computed(() => !mine.value && (teams.data.value?.length ?? 0) > 0)
const link = (kind: 'coach' | 'self') => `/evaluate?archer=${archerId}&kind=${kind}&name=${encodeURIComponent(name ?? '')}`
const kindLabel = (kind?: string) => (kind === 'self' ? t('evaluations.selfKind') : t('evaluations.coachKind'))
</script>

<template>
  <AppPage :title="name ? $t('evaluations.titleFor', { name }) : $t('evaluations.title')">
    <div class="screen">
      <AppButton v-if="canCoach" :router-link="link('coach')">{{ $t('evaluations.new') }}</AppButton>
      <AppButton :secondary="canCoach" v-if="mine" :router-link="link('self')">{{ $t('evaluations.newSelf') }}</AppButton>
      <ErrorText :message="list.error.value" />
      <div v-if="list.loading.value && !list.data.value">{{ $t('common.loading') }}</div>
      <div v-else-if="list.data.value?.length === 0">{{ $t('evaluations.empty') }}</div>
      <IonList v-if="list.data.value?.length" inset>
        <IonItem v-for="e in list.data.value" :key="e.id" :router-link="`/evaluations/${e.id}`" detail lines="full">
          <IonLabel class="ion-text-wrap">
            <h3>{{ new Date(e.date ?? e.created_at).toLocaleDateString() }} · {{ kindLabel(e.kind) }}</h3>
            <p>
              {{ e.template_name }} · {{ e.author_name }}<template v-if="average(e.scores) !== null"> · Ø {{ average(e.scores) }}</template
              ><template v-if="e.kind === 'coach' && e.visibility === 'coach_only'"> · {{ $t('evaluations.coachOnly') }}</template>
            </p>
          </IonLabel>
        </IonItem>
      </IonList>
    </div>
  </AppPage>
</template>
