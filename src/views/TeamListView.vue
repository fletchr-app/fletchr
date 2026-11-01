<script setup lang="ts">
import { onIonViewWillEnter } from '@ionic/vue'

import AppPage from '@/components/AppPage.vue'
import AppButton from '@/components/AppButton.vue'
import TeamOverview from '@/components/TeamOverview.vue'
import TeamRoster from '@/components/TeamRoster.vue'
import { useTeams } from '@/composables/useTeams'

const { teams, loaded, load } = useTeams()

onIonViewWillEnter(load)
</script>

<template>
  <AppPage :title="$t('team.title')" :back="false">
    <div class="screen">
      <div v-if="loaded && teams.length === 0" class="d-flex flex-column gap-2">
        <div>{{ $t('team.noTeam') }}</div>
        <AppButton secondary router-link="/join-team">{{ $t('team.joinTeam') }}</AppButton>
      </div>
      <template v-for="team in teams" :key="team.id">
        <TeamOverview v-if="team.my_role !== 'archer'" :team="team" />
        <div v-else class="d-flex flex-column gap-2">
          <h2 class="h5 m-0">{{ team.name }}</h2>
          <AppButton secondary :router-link="`/team/${team.id}/agenda`">{{ $t('schedule.agenda') }}</AppButton>
          <TeamRoster :team-id="team.id" />
        </div>
      </template>
    </div>
  </AppPage>
</template>
