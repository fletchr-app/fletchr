<script setup lang="ts">
import { IonItem, IonLabel, IonList } from '@ionic/vue'
import type { RouteLocationRaw } from 'vue-router'
import { useI18n } from 'vue-i18n'

import ErrorText from '@/components/ErrorText.vue'
import SectionLink from '@/components/SectionLink.vue'
import { ARROW_SET_FIELDS, BOW_FIELDS } from '@/lib/equipment-fields'
import { type GearItem, gearSummary } from '@/lib/profile'

// The bow and the arrow set in use (the first active of each), a few values each. The whole list is on the equipment page.
defineProps<{ bow?: GearItem; arrows?: GearItem; loaded: boolean; error: string | null; to?: RouteLocationRaw; add?: RouteLocationRaw }>()
const { t } = useI18n()
const choice = (_key: string, value: string) => t(`equipment.bowType.${value}`)
</script>

<template>
  <div class="d-flex flex-column gap-2">
    <div class="d-flex align-items-center justify-content-between">
      <h2 class="h5 m-0">{{ $t('archer.equipment') }}</h2>
      <SectionLink :add="add" :add-label="$t('equipment.addBow')" :to="to" />
    </div>
    <ErrorText :message="error" />
    <div v-if="loaded && !bow && !arrows">{{ $t('archer.noEquipment') }}</div>
    <IonList v-else-if="bow || arrows" inset class="m-0">
      <IonItem v-if="bow" lines="full">
        <IonLabel class="ion-text-wrap">
          <h3>{{ bow.name }}</h3>
          <p>{{ gearSummary(bow, BOW_FIELDS, ['type', 'draw_weight', 'sight'], choice) }}</p>
        </IonLabel>
      </IonItem>
      <IonItem v-if="arrows" lines="full">
        <IonLabel class="ion-text-wrap">
          <h3>{{ arrows.name }}</h3>
          <p>{{ gearSummary(arrows, ARROW_SET_FIELDS, ['shaft_model', 'spine', 'point_weight'], choice) }}</p>
        </IonLabel>
      </IonItem>
    </IonList>
  </div>
</template>
