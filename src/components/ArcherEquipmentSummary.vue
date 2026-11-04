<script setup lang="ts">
import { IonItem, IonLabel, IonList } from '@ionic/vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import ErrorText from '@/components/ErrorText.vue'
import SectionLink from '@/components/SectionLink.vue'
import { useAuth } from '@/composables/useAuth'
import { useRemote } from '@/composables/useRemote'
import { ARROW_SET_FIELDS, BOW_FIELDS, type FieldSpec } from '@/lib/equipment-fields'

// The bow and the arrow set an archer uses now (the first active of each), a few values each. The whole list is on the equipment page.
const props = defineProps<{ archerId: number; name: string }>()
const { t } = useI18n()
const { api } = useAuth()
const bows = useRemote(async () => (await api.GET('/api/bows/', { params: { query: { owner: props.archerId } } })).data ?? null)
const arrowSets = useRemote(async () => (await api.GET('/api/arrow-sets/', { params: { query: { owner: props.archerId } } })).data ?? null)

type Item = { name: string; is_active?: boolean } & Record<string, unknown>

/** The first filled values of the item, as "38 lb · Shibuya", for the second line. */
function summary(item: Item, fields: FieldSpec[], keys: string[]) {
  return keys
    .map((key) => fields.find((f) => f.key === key))
    .filter((f): f is FieldSpec => !!f && item[f.key] !== undefined && item[f.key] !== null && item[f.key] !== '')
    .map((f) => (f.kind === 'choice' ? t(`equipment.bowType.${item[f.key]}`) : `${item[f.key]}${f.unit ? ` ${f.unit}` : ''}`))
    .join(' · ')
}

const bow = computed(() => (bows.data.value ?? []).find((b) => b.is_active !== false) as Item | undefined)
const arrows = computed(() => (arrowSets.data.value ?? []).find((a) => a.is_active !== false) as Item | undefined)
const empty = computed(() => !bows.loading.value && !arrowSets.loading.value && !bow.value && !arrows.value)
</script>

<template>
  <div class="d-flex flex-column gap-2">
    <div class="d-flex align-items-center justify-content-between">
      <h2 class="h5 m-0">{{ $t('archer.equipment') }}</h2>
      <SectionLink v-if="bow || arrows" :to="`/archers/${archerId}/equipment?name=${encodeURIComponent(name)}`" />
    </div>
    <ErrorText :message="bows.error.value || arrowSets.error.value" />
    <div v-if="empty">{{ $t('archer.noEquipment') }}</div>
    <IonList v-else-if="bow || arrows" inset class="m-0">
      <IonItem v-if="bow" lines="full">
        <IonLabel class="ion-text-wrap">
          <h3>{{ bow.name }}</h3>
          <p>{{ summary(bow, BOW_FIELDS, ['type', 'draw_weight', 'sight']) }}</p>
        </IonLabel>
      </IonItem>
      <IonItem v-if="arrows" lines="full">
        <IonLabel class="ion-text-wrap">
          <h3>{{ arrows.name }}</h3>
          <p>{{ summary(arrows, ARROW_SET_FIELDS, ['shaft_model', 'spine', 'point_weight']) }}</p>
        </IonLabel>
      </IonItem>
    </IonList>
  </div>
</template>
