<script setup lang="ts">
import { IonItem, IonLabel, IonList, IonListHeader } from '@ionic/vue'
import { useRoute } from 'vue-router'

import AppPage from '@/components/AppPage.vue'
import ErrorText from '@/components/ErrorText.vue'
import { useAuth } from '@/composables/useAuth'
import { useRemote } from '@/composables/useRemote'
import { ARROW_SET_FIELDS, BOW_FIELDS, type FieldSpec } from '@/lib/equipment-fields'

// An archer's bows and arrow sets, read-only, for their coach. Only the archer can change them.
const route = useRoute()
const id = Number(route.params.id)

const { api } = useAuth()
const bows = useRemote(async () => (await api.GET('/api/bows/', { params: { query: { owner: id } } })).data ?? null)
const arrowSets = useRemote(async () => (await api.GET('/api/arrow-sets/', { params: { query: { owner: id } } })).data ?? null)

type Item = { id: number; is_active?: boolean } & Record<string, unknown>

/** The filled-in fields (not the name, that is the title), as [label key, value with unit]. */
function lines(item: Item, fields: FieldSpec[]) {
  return fields
    .filter((f) => f.key !== 'name' && item[f.key] !== undefined && item[f.key] !== null && item[f.key] !== '')
    .map((f) => ({ key: f.key, value: f.kind === 'choice' ? `equipment.bowType.${item[f.key]}` : String(item[f.key]), choice: f.kind === 'choice', unit: f.unit }))
}
</script>

<template>
  <AppPage :title="$t('archer.equipment')">
    <div class="screen">
      <ErrorText :message="bows.error.value || arrowSets.error.value" />
      <div v-if="bows.loading.value || arrowSets.loading.value">{{ $t('common.loading') }}</div>
      <template v-else>
        <div v-if="!bows.data.value?.length && !arrowSets.data.value?.length">{{ $t('archer.noEquipment') }}</div>
        <IonList v-if="bows.data.value?.length" inset>
          <IonListHeader>{{ $t('equipment.bows') }}</IonListHeader>
          <IonItem v-for="bow in bows.data.value" :key="bow.id" lines="full" :style="{ opacity: bow.is_active === false ? 0.5 : 1 }">
            <IonLabel class="ion-text-wrap">
              <h3>{{ bow.name }}{{ bow.is_active === false ? ` (${$t('equipment.inactive')})` : '' }}</h3>
              <p v-for="l in lines(bow as Item, BOW_FIELDS)" :key="l.key">{{ $t(`equipment.field.${l.key}`) }}: {{ l.choice ? $t(l.value) : l.value }}{{ l.unit ? ` ${l.unit}` : '' }}</p>
            </IonLabel>
          </IonItem>
        </IonList>
        <IonList v-if="arrowSets.data.value?.length" inset>
          <IonListHeader>{{ $t('equipment.arrowSets') }}</IonListHeader>
          <IonItem v-for="set in arrowSets.data.value" :key="set.id" lines="full" :style="{ opacity: set.is_active === false ? 0.5 : 1 }">
            <IonLabel class="ion-text-wrap">
              <h3>{{ set.name }}{{ set.is_active === false ? ` (${$t('equipment.inactive')})` : '' }}</h3>
              <p v-for="l in lines(set as Item, ARROW_SET_FIELDS)" :key="l.key">{{ $t(`equipment.field.${l.key}`) }}: {{ l.value }}{{ l.unit ? ` ${l.unit}` : '' }}</p>
            </IonLabel>
          </IonItem>
        </IonList>
      </template>
    </div>
  </AppPage>
</template>
