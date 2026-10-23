<script setup lang="ts">
import AppPage from '@/components/AppPage.vue'
import DeleteAccount from '@/components/privacy/DeleteAccount.vue'
import DeleteData from '@/components/privacy/DeleteData.vue'
import ExportData from '@/components/privacy/ExportData.vue'
</script>

<template>
  <AppPage :title="$t('privacy.title')">
    <div class="screen">
      <section class="d-flex flex-column gap-2">
        <h2 class="h5 m-0">{{ $t('privacy.profilesTitle') }}</h2>
        <div>{{ $t('privacy.profilesText1') }}</div>
        <div>{{ $t('privacy.profilesText2') }}</div>
      </section>
      <ExportData />
      <DeleteData />
      <DeleteAccount />
    </div>
  </AppPage>
</template>
