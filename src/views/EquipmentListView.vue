<script setup lang="ts">
import { IonItem, IonLabel, IonList, IonListHeader } from '@ionic/vue'
import AppPage from '@/components/AppPage.vue'
import { onMounted, ref } from 'vue'

import ErrorText from '@/components/ErrorText.vue'
import { useAuth } from '@/composables/useAuth'
import type { components } from '@/lib/api-types'

type Bow = components['schemas']['Bow']
type ArrowSet = components['schemas']['ArrowSet']

const { api } = useAuth()
const bows = ref<Bow[]>([])
const arrowSets = ref<ArrowSet[]>([])
const error = ref<string | null>(null)

onMounted(() =>
  (async () => {
    // The list also contains the equipment of archers you coach, so ask for your own.
    const me = (await api.GET('/api/me/')).data
    if (!me) return (error.value = 'Could not load your data')
    const query = { owner: me.id }
    const [b, a] = await Promise.all([api.GET('/api/bows/', { params: { query } }), api.GET('/api/arrow-sets/', { params: { query } })])
    bows.value = b.data ?? []
    arrowSets.value = a.data ?? []
    error.value = b.data && a.data ? null : 'Could not load your equipment'
  })().catch(() => (error.value = 'Server not reachable')),
)
</script>

<template>
  <AppPage title="Equipment">
    <div class="screen">
      <ErrorText :message="error" />
      <IonList inset>
        <IonListHeader>Bows</IonListHeader>
        <IonItem v-for="bow in bows" :key="bow.id" :router-link="`/equipment/bows/${bow.id}`" detail lines="full" :style="{ opacity: bow.is_active === false ? 0.5 : 1 }">
          <IonLabel>
            <h3>{{ bow.name }}{{ bow.is_active === false ? ' (inactive)' : '' }}</h3>
            <p>{{ bow.type ? `${bow.type} · ` : '' }}revision {{ bow.revision_number }}</p>
          </IonLabel>
        </IonItem>
        <IonItem router-link="/equipment/bows/new" detail lines="none"><IonLabel color="primary">Add a bow</IonLabel></IonItem>
      </IonList>
      <IonList inset>
        <IonListHeader>Arrow sets</IonListHeader>
        <IonItem v-for="set in arrowSets" :key="set.id" :router-link="`/equipment/arrow-sets/${set.id}`" detail lines="full" :style="{ opacity: set.is_active === false ? 0.5 : 1 }">
          <IonLabel>
            <h3>{{ set.name }}{{ set.is_active === false ? ' (inactive)' : '' }}</h3>
            <p>{{ [set.shaft_model, set.spine].filter(Boolean).join(' ') ? `${[set.shaft_model, set.spine].filter(Boolean).join(' ')} · ` : '' }}revision {{ set.revision_number }}</p>
          </IonLabel>
        </IonItem>
        <IonItem router-link="/equipment/arrow-sets/new" detail lines="none"><IonLabel color="primary">Add an arrow set</IonLabel></IonItem>
      </IonList>
    </div>
  </AppPage>
</template>
