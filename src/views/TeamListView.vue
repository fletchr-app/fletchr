<script setup lang="ts">
import { onIonViewWillEnter } from '@ionic/vue'
import { computed } from 'vue'

import AppPage from '@/components/AppPage.vue'
import TeamOverview from '@/components/TeamOverview.vue'
import { useTeams } from '@/composables/useTeams'

const { teams, loaded, load } = useTeams()
const coached = computed(() => teams.value.filter((t) => t.my_role !== 'archer'))

onIonViewWillEnter(load)
</script>

<template>
  <AppPage title="Team" :back="false">
    <div class="screen">
      <div v-if="loaded && coached.length === 0">You are not a coach in any team.</div>
      <TeamOverview v-for="team in coached" :key="team.id" :team="team" />
    </div>
  </AppPage>
</template>
