<script setup lang="ts">
import { IonItem, IonLabel, IonList, IonListHeader } from '@ionic/vue'
import AppPage from '@/components/AppPage.vue'
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import ErrorText from '@/components/ErrorText.vue'
import { useAuth } from '@/composables/useAuth'
import type { components } from '@/lib/api-types'

type Bow = components['schemas']['Bow']
type ArrowSet = components['schemas']['ArrowSet']

const { api } = useAuth()
const { t } = useI18n()
const bows = ref<Bow[]>([])
const arrowSets = ref<ArrowSet[]>([])
const error = ref<string | null>(null)

onMounted(() =>
  (async () => {
    // The list also contains the equipment of archers you coach, so ask for your own.
    const me = (await api.GET('/api/me/')).data
    if (!me) return (error.value = t('equipment.couldNotLoadData'))
    const query = { owner: me.id }
    const [b, a] = await Promise.all([api.GET('/api/bows/', { params: { query } }), api.GET('/api/arrow-sets/', { params: { query } })])
    bows.value = b.data ?? []
    arrowSets.value = a.data ?? []
    error.value = b.data && a.data ? null : t('equipment.couldNotLoadEquipment')
  })().catch(() => (error.value = t('common.serverNotReachable'))),
)
</script>

<template>
  <AppPage :title="$t('equipment.title')">
    <div class="screen">
      <ErrorText :message="error" />
      <IonList inset>
        <IonListHeader>{{ $t('equipment.bows') }}</IonListHeader>
        <IonItem v-for="bow in bows" :key="bow.id" :router-link="`/equipment/bows/${bow.id}`" detail lines="full" :style="{ opacity: bow.is_active === false ? 0.5 : 1 }">
          <IonLabel>
            <h3>{{ bow.name }}{{ bow.is_active === false ? ` (${$t('equipment.inactive')})` : '' }}</h3>
            <p>{{ bow.type ? `${$t(`equipment.bowType.${bow.type}`)} · ` : '' }}{{ $t('equipment.revision', { n: bow.revision_number }) }}</p>
          </IonLabel>
        </IonItem>
        <IonItem router-link="/equipment/bows/new" detail lines="none"><IonLabel color="primary">{{ $t('equipment.addBow') }}</IonLabel></IonItem>
      </IonList>
      <IonList inset>
        <IonListHeader>{{ $t('equipment.arrowSets') }}</IonListHeader>
        <IonItem v-for="set in arrowSets" :key="set.id" :router-link="`/equipment/arrow-sets/${set.id}`" detail lines="full" :style="{ opacity: set.is_active === false ? 0.5 : 1 }">
          <IonLabel>
            <h3>{{ set.name }}{{ set.is_active === false ? ` (${$t('equipment.inactive')})` : '' }}</h3>
            <p>{{ [set.shaft_model, set.spine].filter(Boolean).join(' ') ? `${[set.shaft_model, set.spine].filter(Boolean).join(' ')} · ` : '' }}{{ $t('equipment.revision', { n: set.revision_number }) }}</p>
          </IonLabel>
        </IonItem>
        <IonItem router-link="/equipment/arrow-sets/new" detail lines="none"><IonLabel color="primary">{{ $t('equipment.addArrowSet') }}</IonLabel></IonItem>
      </IonList>
    </div>
  </AppPage>
</template>
