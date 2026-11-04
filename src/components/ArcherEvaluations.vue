<script setup lang="ts">
import { IonItem, IonLabel, IonList } from '@ionic/vue'
import { useI18n } from 'vue-i18n'

import ErrorText from '@/components/ErrorText.vue'
import SectionLink from '@/components/SectionLink.vue'
import { useAuth } from '@/composables/useAuth'
import { useRemote } from '@/composables/useRemote'
import { average } from '@/lib/evaluation'

// The latest evaluation of an archer; a coach adds one with the plus, the arrow opens all of them.
const props = defineProps<{ archerId: number; name: string; canEvaluate: boolean }>()
const { t } = useI18n()
const { api } = useAuth()
const list = useRemote(async () => (await api.GET('/api/evaluations/', { params: { query: { archer: props.archerId } } })).data ?? null)
const kindLabel = (kind?: string) => (kind === 'self' ? t('evaluations.selfKind') : t('evaluations.coachKind'))
</script>

<template>
  <div class="d-flex flex-column gap-2">
    <div class="d-flex align-items-center justify-content-between">
      <h2 class="h5 m-0">{{ $t('evaluations.title') }}</h2>
      <SectionLink
        :add="canEvaluate ? `/evaluate?archer=${archerId}&kind=coach&name=${encodeURIComponent(name)}` : undefined"
        :add-label="$t('evaluations.new')"
        :to="list.data.value?.length ? `/archers/${archerId}/evaluations?name=${encodeURIComponent(name)}` : undefined"
      />
    </div>
    <ErrorText :message="list.error.value" />
    <div v-if="list.data.value?.length === 0">{{ $t('evaluations.empty') }}</div>
    <IonList v-else-if="list.data.value?.length" inset class="m-0">
      <IonItem :router-link="`/evaluations/${list.data.value[0]!.id}`" detail lines="full">
        <IonLabel class="ion-text-wrap">
          <h3>{{ new Date(list.data.value[0]!.date ?? list.data.value[0]!.created_at).toLocaleDateString() }} · {{ kindLabel(list.data.value[0]!.kind) }}</h3>
          <p>
            {{ list.data.value[0]!.template_name }} · {{ list.data.value[0]!.author_name
            }}<template v-if="average(list.data.value[0]!.scores) !== null"> · Ø {{ average(list.data.value[0]!.scores) }}</template>
          </p>
        </IonLabel>
      </IonItem>
    </IonList>
  </div>
</template>
