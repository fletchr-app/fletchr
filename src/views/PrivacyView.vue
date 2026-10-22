<script setup lang="ts">
import AppPage from '@/components/AppPage.vue'
import DeleteAccount from '@/components/privacy/DeleteAccount.vue'
import DeleteData from '@/components/privacy/DeleteData.vue'
import ExportData from '@/components/privacy/ExportData.vue'
</script>

<template>
  <AppPage title="Your data">
    <div class="screen">
      <ExportData />
      <DeleteData />
      <DeleteAccount />
    </div>
  </AppPage>
</template>
