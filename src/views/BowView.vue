<script setup lang="ts">
import AppPage from '@/components/AppPage.vue'
import EquipmentForm, { type EquipmentAdapter } from '@/components/EquipmentForm.vue'
import { useAuth } from '@/composables/useAuth'
import type { components } from '@/lib/api-types'
import { BOW_FIELDS } from '@/lib/equipment-fields'
import { errorMessage } from '@/lib/errors'

type Body = components['schemas']['BowRequest']

const { api } = useAuth()
const adapter: EquipmentAdapter = {
  load: async (id) => (await api.GET('/api/bows/{id}/', { params: { path: { id } } })).data ?? null,
  revisions: async (id) => (await api.GET('/api/bows/{id}/revisions/', { params: { path: { id } } })).data ?? [],
  create: async (payload) => {
    const { data, error } = await api.POST('/api/bows/', { body: payload as Body })
    return data ? null : errorMessage(error)
  },
  update: async (id, payload) => {
    const { data, error } = await api.PATCH('/api/bows/{id}/', { params: { path: { id } }, body: payload })
    return data ? null : errorMessage(error)
  },
  remove: async (id) => {
    const { response, error } = await api.DELETE('/api/bows/{id}/', { params: { path: { id } } })
    return response.ok ? null : errorMessage(error)
  },
}
</script>

<template>
  <AppPage title="Bow">
    <EquipmentForm label="bow" :fields="BOW_FIELDS" :adapter="adapter" />
  </AppPage>
</template>
