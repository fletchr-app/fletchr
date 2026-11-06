<script setup lang="ts">
import { IonItem, IonLabel, IonList } from '@ionic/vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { RouteLocationRaw } from 'vue-router'

import ErrorText from '@/components/ErrorText.vue'
import SectionLink from '@/components/SectionLink.vue'
import type { components } from '@/lib/api-types'
import { average } from '@/lib/evaluation'

type Evaluation = components['schemas']['Evaluation']

// The latest evaluation; the plus adds one, the arrow opens all of them. `quiet`: a failed load (no connection) is one muted line, not an error.
const props = defineProps<{ evaluations: Evaluation[] | null; error: string | null; quiet?: boolean; to?: RouteLocationRaw; add?: RouteLocationRaw; addLabel: string }>()
const { t } = useI18n()
const kindLabel = (kind?: string) => (kind === 'self' ? t('evaluations.selfKind') : t('evaluations.coachKind'))
const latest = computed(() => props.evaluations?.[0])
</script>

<template>
  <div class="d-flex flex-column gap-2">
    <div class="d-flex align-items-center justify-content-between">
      <h2 class="h5 m-0">{{ $t('evaluations.title') }}</h2>
      <SectionLink :add="add" :add-label="addLabel" :to="to" />
    </div>
    <div v-if="error && quiet && !evaluations" class="muted">{{ $t('profile.offlineEvaluations') }}</div>
    <ErrorText v-else :message="error" />
    <div v-if="evaluations?.length === 0">{{ $t('evaluations.empty') }}</div>
    <IonList v-else-if="latest" inset class="m-0">
      <IonItem :router-link="`/evaluations/${latest.id}`" detail lines="full">
        <IonLabel class="ion-text-wrap">
          <h3>{{ new Date(latest.date ?? latest.created_at).toLocaleDateString() }} · {{ kindLabel(latest.kind) }}</h3>
          <p>
            {{ latest.template_name }} · {{ latest.author_name }}<template v-if="average(latest.scores) !== null"> · Ø {{ average(latest.scores) }}</template>
          </p>
        </IonLabel>
      </IonItem>
    </IonList>
  </div>
</template>
