<script setup lang="ts">
import AppPage from '@/components/AppPage.vue'
import EquipmentForm from '@/components/EquipmentForm.vue'
import { ARROW_SET_FIELDS } from '@/lib/equipment-fields'
</script>

<template>
  <AppPage :title="$t('equipment.arrowSet')">
    <EquipmentForm kind="arrowSet" :fields="ARROW_SET_FIELDS" />
  </AppPage>
</template>
