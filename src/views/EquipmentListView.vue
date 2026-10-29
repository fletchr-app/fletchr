<script setup lang="ts">
import { IonItem, IonLabel, IonList, IonListHeader, onIonViewWillEnter } from '@ionic/vue'
import AppPage from '@/components/AppPage.vue'
import SyncBanner from '@/components/SyncBanner.vue'
import { useEquipment } from '@/composables/useEquipment'

// The copy on the device, so the list also works without a connection.
const { bows, arrowSets, refresh } = useEquipment()

// The list stays alive underneath the bow and arrow set forms, so it asks the server again each time it is shown.
onIonViewWillEnter(() => void refresh())
</script>

<template>
  <AppPage :title="$t('equipment.title')">
    <div class="screen">
      <SyncBanner />
      <IonList inset>
        <IonListHeader>{{ $t('equipment.bows') }}</IonListHeader>
        <IonItem v-for="bow in bows" :key="bow.uid" :router-link="`/equipment/bows/${bow.uid}`" detail lines="full" :style="{ opacity: bow.is_active === false ? 0.5 : 1 }">
          <IonLabel>
            <h3>{{ bow.values.name }}{{ bow.is_active === false ? ` (${$t('equipment.inactive')})` : '' }}</h3>
            <p>{{ bow.values.type ? `${$t(`equipment.bowType.${bow.values.type}`)} · ` : '' }}{{ $t('equipment.revision', { n: bow.revisions[0]?.number ?? 1 }) }}</p>
          </IonLabel>
        </IonItem>
        <IonItem router-link="/equipment/bows/new" detail lines="none"><IonLabel color="primary">{{ $t('equipment.addBow') }}</IonLabel></IonItem>
      </IonList>
      <IonList inset>
        <IonListHeader>{{ $t('equipment.arrowSets') }}</IonListHeader>
        <IonItem v-for="set in arrowSets" :key="set.uid" :router-link="`/equipment/arrow-sets/${set.uid}`" detail lines="full" :style="{ opacity: set.is_active === false ? 0.5 : 1 }">
          <IonLabel>
            <h3>{{ set.values.name }}{{ set.is_active === false ? ` (${$t('equipment.inactive')})` : '' }}</h3>
            <p>{{ [set.values.shaft_model, set.values.spine].filter(Boolean).join(' ') ? `${[set.values.shaft_model, set.values.spine].filter(Boolean).join(' ')} · ` : '' }}{{ $t('equipment.revision', { n: set.revisions[0]?.number ?? 1 }) }}</p>
          </IonLabel>
        </IonItem>
        <IonItem router-link="/equipment/arrow-sets/new" detail lines="none"><IonLabel color="primary">{{ $t('equipment.addArrowSet') }}</IonLabel></IonItem>
      </IonList>
    </div>
  </AppPage>
</template>
