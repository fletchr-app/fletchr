<script setup lang="ts">
import AppPage from '@/components/AppPage.vue'
import { IonIcon } from '@ionic/vue'
import { cloudUploadOutline } from 'ionicons/icons'
import { computed, ref } from 'vue'
import { onBeforeRouteLeave, RouterLink, useRoute, useRouter } from 'vue-router'

import AppButton from '@/components/AppButton.vue'
import SessionDetailsText from '@/components/SessionDetailsText.vue'
import SessionPlots from '@/components/SessionPlots.vue'
import SyncBanner from '@/components/SyncBanner.vue'
import VolumeLog from '@/components/VolumeLog.vue'
import { useLog } from '@/composables/useLog'
import { gearLine, nextEndDefaults, sessionTotals, usesEnds } from '@/lib/log-model'

const route = useRoute()
const router = useRouter()
const { loaded, sessions, waiting, failed, finishSession, deleteSession } = useLog()
const confirmDelete = ref(false)

const sessionId = route.params.id as string
// Photos of this session; for an archer without an account, the coach adds them for that archer.
const mediaLink = computed(() => ({
  path: '/media',
  query: { session: sessionId, ...(session.value?.owner ? { owner: session.value.owner, name: session.value.owner_name } : {}) },
}))
const session = computed(() => sessions.value.find((s) => s.id === sessionId))
const fixed = computed(() => !!session.value && usesEnds(session.value.type))
const totals = computed(() => (session.value ? sessionTotals(session.value) : null))

// A session left before anything was entered would only clutter the list. Its photos page belongs to it.
onBeforeRouteLeave((to) => {
  const s = session.value
  const staying = to.path.startsWith(`/training/${s?.id}`) || (to.path === '/media' && to.query.session === s?.id)
  if (s && !staying && s.ends.length === 0 && s.volume.length === 0) deleteSession(s.id)
})

// The settings are asked once, before the first end; later ends start from the previous one (changeable via the link).
function entry(settings: { distance_m: string; face: string; arrows_per_end: number }) {
  const query = { distance: settings.distance_m, face: settings.face, arrows: String(settings.arrows_per_end) }
  void router.push({ path: `/training/${session.value!.id}/end`, query })
}
// Finishing goes back to the home screen; reopening stays here.
function finish() {
  const s = session.value!
  finishSession(s.id, !s.ended_at)
  // Back to the home screen, or for a coach to the archer's page.
  if (!s.ended_at) void router.replace(s.owner ? { path: `/archers/${s.owner}`, query: { name: s.owner_name } } : '/')
}
function newEnd() {
  if (session.value!.ends.length === 0) void router.push(`/training/${session.value!.id}/setup`)
  else entry(nextEndDefaults(session.value!))
}
</script>

<template>
  <AppPage :title="$t('session.title')" :fixed="fixed">
    <div v-if="!session || !totals" class="screen">{{ loaded ? $t('session.notOnDevice') : $t('common.loading') }}</div>
    <!-- Ends sessions: one screen without scrolling. The list of ends and delete are on the ends page. -->
    <div v-else-if="usesEnds(session.type)" class="entry">
      <!-- Uploads that wait show as an icon, so the screen does not jump when they finish; only refused ones need the full banner. -->
      <SyncBanner v-if="failed.length > 0" />
      <div class="d-flex align-items-center gap-2">
        <h2 class="h5 m-0 flex-grow-1">{{ $t(`sessionType.${session.type}`) }} · {{ new Date(session.started_at).toLocaleDateString() }}</h2>
        <IonIcon v-if="waiting > 0" :icon="cloudUploadOutline" class="muted" :title="$t('session.waiting', { n: waiting }, waiting)" />
      </div>
      <div class="muted">
        {{ session.location ? `${session.location} · ` : '' }}{{ $t('count.arrows', totals.arrows) }} · {{ $t('count.points', totals.score) }}{{ session.ended_at ? ` · ${$t('session.finished')}` : '' }}
      </div>
      <div v-if="session.owner_name" class="muted">{{ $t('session.forArcher', { name: session.owner_name }) }}</div>
      <div v-else class="muted">{{ $t('session.equipment', { gear: gearLine(session.gear) || $t('session.noneChosen') }) }}</div>
      <SessionPlots fill :session="session" />
      <div v-if="totals.arrows === 0" class="flex-grow-1"></div>
      <div class="d-flex justify-content-center gap-4">
        <RouterLink v-if="session.ends.length > 0" :to="`/training/${session.id}/setup`">{{ session.owner ? $t('session.changeSetupArcher') : $t('session.changeSetup') }}</RouterLink>
        <RouterLink v-if="!session.owner" :to="`/training/${session.id}/details`">{{ $t('details.link') }}</RouterLink>
        <RouterLink :to="mediaLink">{{ $t('media.link') }}</RouterLink>
      </div>
      <AppButton @click="newEnd">{{ $t('session.newEnd') }}</AppButton>
      <div class="d-flex gap-2">
        <AppButton v-if="session.ends.length > 0" secondary @click="router.push(`/training/${session.id}/ends`)">{{ $t('session.allEnds') }}</AppButton>
        <AppButton secondary @click="finish">{{ session.ended_at ? $t('session.reopen') : $t('session.finish') }}</AppButton>
      </div>
    </div>
    <div v-else class="screen">
      <SyncBanner />
      <h2 class="h5 m-0">{{ $t(`sessionType.${session.type}`) }} · {{ new Date(session.started_at).toLocaleDateString() }}</h2>
      <div class="muted">
        {{ session.location ? `${session.location} · ` : '' }}{{ $t('count.arrows', totals.arrows) }}{{ session.ended_at ? ` · ${$t('session.finished')}` : '' }}
      </div>
      <div v-if="session.owner_name" class="muted">{{ $t('session.forArcher', { name: session.owner_name }) }}</div>
      <div v-else class="muted">{{ $t('session.equipment', { gear: gearLine(session.gear) || $t('session.noneChosen') }) }}</div>
      <SessionDetailsText :details="session.details" />
      <div class="d-flex gap-4">
        <RouterLink v-if="!session.owner" :to="`/training/${session.id}/details`">{{ $t('details.link') }}</RouterLink>
        <RouterLink :to="mediaLink">{{ $t('media.link') }}</RouterLink>
      </div>
      <VolumeLog :session="session" />
      <AppButton secondary @click="finish">{{ session.ended_at ? $t('session.reopenSession') : $t('session.finish') }}</AppButton>
      <AppButton secondary @click="confirmDelete ? deleteSession(session.id) : (confirmDelete = true)">
        {{ confirmDelete ? $t('session.deleteConfirm') : $t('session.delete') }}
      </AppButton>
    </div>
  </AppPage>
</template>
