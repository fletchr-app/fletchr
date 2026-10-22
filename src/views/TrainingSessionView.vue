<script setup lang="ts">
import AppPage from '@/components/AppPage.vue'
import { IonIcon } from '@ionic/vue'
import { cloudUploadOutline } from 'ionicons/icons'
import { computed, ref } from 'vue'
import { onBeforeRouteLeave, RouterLink, useRoute, useRouter } from 'vue-router'

import AppButton from '@/components/AppButton.vue'
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
const session = computed(() => sessions.value.find((s) => s.id === sessionId))
const fixed = computed(() => !!session.value && usesEnds(session.value.type))
const totals = computed(() => (session.value ? sessionTotals(session.value) : null))

// A session left before anything was entered would only clutter the list.
onBeforeRouteLeave((to) => {
  const s = session.value
  if (s && !to.path.startsWith(`/training/${s.id}`) && s.ends.length === 0 && s.volume.length === 0) deleteSession(s.id)
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
  <AppPage title="Session" :fixed="fixed">
    <div v-if="!session || !totals" class="screen">{{ loaded ? 'This session is not on this device.' : 'Loading…' }}</div>
    <!-- Ends sessions: one screen without scrolling. The list of ends and delete are on the ends page. -->
    <div v-else-if="usesEnds(session.type)" class="entry">
      <!-- Uploads that wait show as an icon, so the screen does not jump when they finish; only refused ones need the full banner. -->
      <SyncBanner v-if="failed.length > 0" />
      <div class="d-flex align-items-center gap-2">
        <h2 class="h5 m-0 flex-grow-1">{{ session.type }} · {{ new Date(session.started_at).toLocaleDateString() }}</h2>
        <IonIcon v-if="waiting > 0" :icon="cloudUploadOutline" class="muted" :title="`${waiting} waiting to upload`" />
      </div>
      <div class="muted">
        {{ session.location ? `${session.location} · ` : '' }}{{ totals.arrows }} arrows · {{ totals.score }} points{{ session.ended_at ? ' · finished' : '' }}
      </div>
      <div v-if="session.owner_name" class="muted">For {{ session.owner_name }}</div>
      <div v-else class="muted">Equipment: {{ gearLine(session.gear) || 'none chosen' }}</div>
      <SessionPlots fill :session="session" />
      <div v-if="totals.arrows === 0" class="flex-grow-1"></div>
      <RouterLink v-if="session.ends.length > 0" :to="`/training/${session.id}/setup`" class="text-center">Change distance, face{{ session.owner ? '' : ' or equipment' }}</RouterLink>
      <AppButton @click="newEnd">New end</AppButton>
      <div class="d-flex gap-2">
        <AppButton v-if="session.ends.length > 0" secondary @click="router.push(`/training/${session.id}/ends`)">All ends</AppButton>
        <AppButton secondary @click="finish">{{ session.ended_at ? 'Reopen' : 'Finish session' }}</AppButton>
      </div>
    </div>
    <div v-else class="screen">
      <SyncBanner />
      <h2 class="h5 m-0">{{ session.type }} · {{ new Date(session.started_at).toLocaleDateString() }}</h2>
      <div class="muted">
        {{ session.location ? `${session.location} · ` : '' }}{{ totals.arrows }} arrows{{ session.ended_at ? ' · finished' : '' }}
      </div>
      <div v-if="session.owner_name" class="muted">For {{ session.owner_name }}</div>
      <div v-else class="muted">Equipment: {{ gearLine(session.gear) || 'none chosen' }}</div>
      <VolumeLog :session="session" />
      <AppButton secondary @click="finish">{{ session.ended_at ? 'Reopen session' : 'Finish session' }}</AppButton>
      <AppButton secondary @click="confirmDelete ? deleteSession(session.id) : (confirmDelete = true)">
        {{ confirmDelete ? 'Tap again to delete this session' : 'Delete session' }}
      </AppButton>
    </div>
  </AppPage>
</template>
