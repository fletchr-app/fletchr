<script setup lang="ts">
import DeleteAccount from '@/components/privacy/DeleteAccount.vue'
import DeleteData from '@/components/privacy/DeleteData.vue'
import ExportData from '@/components/privacy/ExportData.vue'
</script>

<template>
  <div class="screen">
    <ExportData />
    <DeleteData />
    <DeleteAccount />
  </div>
</template>
