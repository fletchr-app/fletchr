<script setup lang="ts">
import AppPage from '@/components/AppPage.vue'
import EquipmentForm from '@/components/EquipmentForm.vue'
import { BOW_FIELDS } from '@/lib/equipment-fields'
</script>

<template>
  <AppPage :title="$t('equipment.bow')">
    <EquipmentForm kind="bow" :fields="BOW_FIELDS" />
  </AppPage>
</template>
