<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'

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
  <div class="screen">
    <ErrorText :message="error" />
    <h2 class="h5 m-0">Bows</h2>
    <RouterLink v-for="bow in bows" :key="bow.id" :to="`/equipment/bows/${bow.id}`" class="text-reset text-decoration-none" :style="{ opacity: bow.is_active === false ? 0.5 : 1 }">
      <div class="fw-semibold">{{ bow.name }}{{ bow.is_active === false ? ' (inactive)' : '' }}</div>
      <div class="muted">{{ bow.type ? `${bow.type} · ` : '' }}revision {{ bow.revision_number }}</div>
    </RouterLink>
    <RouterLink to="/equipment/bows/new">Add a bow</RouterLink>
    <h2 class="h5 mt-3 mb-0">Arrow sets</h2>
    <RouterLink v-for="set in arrowSets" :key="set.id" :to="`/equipment/arrow-sets/${set.id}`" class="text-reset text-decoration-none" :style="{ opacity: set.is_active === false ? 0.5 : 1 }">
      <div class="fw-semibold">{{ set.name }}{{ set.is_active === false ? ' (inactive)' : '' }}</div>
      <div class="muted">{{ [set.shaft_model, set.spine].filter(Boolean).join(' ') ? `${[set.shaft_model, set.spine].filter(Boolean).join(' ')} · ` : '' }}revision {{ set.revision_number }}</div>
    </RouterLink>
    <RouterLink to="/equipment/arrow-sets/new">Add an arrow set</RouterLink>
  </div>
</template>
