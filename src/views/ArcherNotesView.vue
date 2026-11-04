<script setup lang="ts">
import { useRoute } from 'vue-router'

import AppPage from '@/components/AppPage.vue'
import NotesSection from '@/components/NotesSection.vue'

// The coach notes about one archer, and a place to write a new one.
const route = useRoute()
const id = Number(route.params.id)
</script>

<template>
  <AppPage :title="$t('notes.coachNotes')">
    <div class="screen">
      <NotesSection :archer-id="id" />
    </div>
  </AppPage>
</template>
