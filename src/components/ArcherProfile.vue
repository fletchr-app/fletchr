<script setup lang="ts">
import { IonItem, IonLabel, IonList, IonListHeader, IonNote } from '@ionic/vue'
import { computed, ref, watch } from 'vue'

import AppAvatar from '@/components/AppAvatar.vue'
import AppButton from '@/components/AppButton.vue'
import ArcherEquipmentSummary from '@/components/ArcherEquipmentSummary.vue'
import ArcherEvaluations from '@/components/ArcherEvaluations.vue'
import ArcherPhotos from '@/components/ArcherPhotos.vue'
import ArcherStatsSummary from '@/components/ArcherStatsSummary.vue'
import ErrorText from '@/components/ErrorText.vue'
import LatestGoals from '@/components/LatestGoals.vue'
import SectionLink from '@/components/SectionLink.vue'
import SessionListItem from '@/components/SessionListItem.vue'
import VersionBanner from '@/components/VersionBanner.vue'
import { useAuth } from '@/composables/useAuth'
import type { ProfileData } from '@/composables/useProfile'
import { sectionLinks } from '@/lib/profile'

// The profile of an archer: picture and name, the equipment, the latest training, evaluations, statistics, the latest photos and
// the latest coach note, each with a plus for a new one and an arrow to the rest. It is the start page for yourself (data from the
// device first) and the archer page for a coach (data from the server); the screens put the menu in the app bar.
const props = defineProps<{ data: ProfileData; /** Where a coach's new training goes. */ newTraining?: string; archerMenuError?: string | null }>()
const { isLocal } = useAuth()

const own = computed(() => props.data.own)
const id = computed(() => props.data.id)
const q = computed(() => `name=${encodeURIComponent(props.data.name)}`)
const links = computed(() =>
  sectionLinks({
    own: own.value,
    isLocal: isLocal.value,
    canEvaluate: props.data.canEvaluate,
    canNote: props.data.canNote,
    counts: {
      sessions: props.data.sessions.length,
      evaluations: props.data.evaluations?.length ?? 0,
      tiles: props.data.tiles.length,
      notes: props.data.latestNote ? 1 : 0,
      gear: !!props.data.bow || !!props.data.arrows,
      arrows: props.data.volume?.total ?? 0,
    },
  }),
)
// Yourself: the screens of the tabs and the lists of your own; a coach: the screens of the archer.
const where = computed(() => {
  const a = id.value
  return own.value
    ? {
        gear: '/equipment',
        sessions: '/training',
        evaluations: a === null ? undefined : `/archers/${a}/evaluations`,
        evaluationsAdd: a === null ? undefined : `/evaluate?archer=${a}&kind=self`,
        stats: '/stats',
        photos: '/media',
        photosAdd: '/media?add=1',
        notes: a === null ? undefined : `/archers/${a}/notes`,
      }
    : {
        gear: `/archers/${a}/equipment?${q.value}`,
        sessions: `/archers/${a}/sessions?${q.value}`,
        evaluations: `/archers/${a}/evaluations?${q.value}`,
        evaluationsAdd: `/evaluate?archer=${a}&kind=coach&${q.value}`,
        stats: `/archers/${a}/stats?${q.value}`,
        photos: `/media?owner=${a}&${q.value}`,
        photosAdd: `/media?owner=${a}&${q.value}&add=1`,
        notes: `/archers/${a}/notes?${q.value}`,
      }
})

// The picture as the page's cover; when the link has run out it is left out and the initials show.
const coverBroken = ref(false)
watch(
  () => props.data.avatarUrl,
  () => (coverBroken.value = false),
)
const noCover = computed(() => !props.data.avatarUrl || coverBroken.value)
const showNotes = computed(() => !own.value || id.value !== null)
</script>

<template>
  <div class="screen">
    <VersionBanner v-if="own" />
    <div v-if="own && id === null" class="muted">{{ $t('local.homeTitle') }}</div>
    <img v-if="data.avatarUrl && !coverBroken" :src="data.avatarUrl" :alt="$t('avatar.alt', { name: data.name })" class="cover" @error="coverBroken = true" />
    <div v-if="noCover || data.profileLine" class="d-flex align-items-center gap-3">
      <AppAvatar v-if="noCover" :name="data.name" :size="72" />
      <div v-if="data.profileLine" class="muted min-w-0">{{ data.profileLine }}</div>
    </div>
    <div v-if="data.managed" class="muted">{{ $t('archer.hasNoAccount', { name: data.name }) }}</div>
    <div v-if="data.consent" class="muted">{{ data.consent }}</div>
    <ErrorText :message="archerMenuError ?? null" />

    <ArcherEquipmentSummary
      :bow="data.bow"
      :arrows="data.arrows"
      :loaded="data.gearLoaded"
      :error="data.gearError"
      :to="links.gearArrow ? where.gear : undefined"
      :add="links.gearPlus ? where.gear : undefined"
    />

    <div class="d-flex flex-column gap-2">
      <div class="d-flex align-items-center justify-content-between">
        <h2 class="h5 m-0">{{ $t('archer.latestTraining') }}</h2>
        <SectionLink
          :add="own ? '/training/new' : newTraining"
          :add-label="own ? $t('training.start') : data.managed ? $t('archer.startFor', { name: data.name }) : $t('archer.openSession')"
          :to="links.trainingArrow ? where.sessions : undefined"
        />
      </div>
      <ErrorText :message="data.sessionsError" />
      <div v-if="data.sessionsLoading">{{ $t('common.loading') }}</div>
      <div v-else-if="data.sessions.length === 0" class="d-flex flex-column gap-2">
        <div>{{ own ? $t('home.noSessions') : $t('archer.noSessions') }}</div>
        <AppButton v-if="own" router-link="/training/new">{{ $t('training.start') }}</AppButton>
      </div>
      <IonList v-else inset class="m-0">
        <SessionListItem :row="data.sessions[0]!" :lines="own ? 'none' : undefined" />
      </IonList>
    </div>

    <template v-if="!own || id !== null">
      <ArcherEvaluations
        :evaluations="data.evaluations"
        :error="data.evaluationsError"
        :quiet="own"
        :to="links.evaluationsArrow ? where.evaluations : undefined"
        :add="links.evaluationsPlus ? where.evaluationsAdd : undefined"
        :add-label="own ? $t('evaluations.newSelf') : $t('evaluations.new')"
      />
      <LatestGoals v-if="own && id !== null" :user-id="id" :evaluations="data.evaluations" />
    </template>

    <ArcherStatsSummary :volume="data.volume" :error="data.statsError" :to="links.statsArrow ? where.stats : undefined" />
    <ArcherPhotos :tiles="data.tiles" :loaded="data.tilesLoaded" :error="data.tilesError" :to="links.photosArrow ? where.photos : undefined" :add="where.photosAdd" />

    <div v-if="showNotes" class="d-flex flex-column gap-2">
      <div class="d-flex align-items-center justify-content-between">
        <h2 class="h5 m-0">{{ own ? $t('notes.fromCoaches') : $t('notes.coachNotes') }}</h2>
        <SectionLink :add="links.notesPlus ? where.notes : undefined" :add-label="$t('notes.newNote')" :to="links.notesArrow ? where.notes : undefined" />
      </div>
      <div v-if="data.latestNote" class="note">
        <div class="muted">{{ data.latestNote.author_name && own ? `${data.latestNote.author_name} · ` : '' }}{{ new Date(data.latestNote.created_at).toLocaleDateString() }}</div>
        <div class="clamp">{{ data.latestNote.body || $t('notes.drawingOnly') }}</div>
      </div>
      <div v-else-if="data.notesLoaded">{{ $t('archer.noNotes') }}</div>
    </div>

    <template v-if="own && id !== null">
      <div v-if="data.teamsLoaded && data.teams.length === 0">{{ $t('home.noTeam') }}</div>
      <IonList v-if="data.teams.length > 0" inset>
        <IonListHeader>{{ $t('home.yourTeams') }}</IonListHeader>
        <IonItem v-for="team in data.teams" :key="team.id" :router-link="`/team/${team.id}`" detail lines="full">
          <IonLabel>{{ team.name }}</IonLabel>
          <IonNote slot="end">{{ $t(`roles.${team.my_role}`) }}</IonNote>
        </IonItem>
      </IonList>
    </template>
  </div>
</template>

<style scoped>
.cover {
  display: block;
  width: 100%;
  height: 240px;
  object-fit: cover;
  object-position: center 25%;
  border-radius: 12px;
}
.min-w-0 {
  min-width: 0;
}
.clamp {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  white-space: pre-line;
}
</style>
