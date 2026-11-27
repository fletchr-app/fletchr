<script setup lang="ts">
import AppPage from '@/components/AppPage.vue'
import WhatsNewList from '@/components/WhatsNewList.vue'
import { useWhatsNew } from '@/composables/useWhatsNew'

// Every "what's new" entry up to the running version, newest first.
const { all } = useWhatsNew()
</script>

<template>
  <AppPage :title="$t('whatsNew.title')" back-href="/settings">
    <div class="screen">
      <WhatsNewList :entries="all" />
    </div>
  </AppPage>
</template>
