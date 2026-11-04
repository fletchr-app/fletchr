<script setup lang="ts">
import { IonIcon } from '@ionic/vue'
import { cloudUploadOutline } from 'ionicons/icons'
import { computed } from 'vue'
import { useRouter } from 'vue-router'

import AppButton from '@/components/AppButton.vue'
import SessionEvent from '@/components/SessionEvent.vue'
import SessionPlots from '@/components/SessionPlots.vue'
import SyncBanner from '@/components/SyncBanner.vue'
import UnattachedHint from '@/components/UnattachedHint.vue'
import { useAuth } from '@/composables/useAuth'
import { useLog } from '@/composables/useLog'
import { gearLine, type LogSession, nextEndDefaults, sessionTotals, sessionTypeKey } from '@/lib/log-model'

// A session with ends that is being shot: the arrows so far, a new end, finish. One screen that does not scroll.
// Photos, notes, changing the setup and deleting are in the app bar (`SessionActions`).
const props = defineProps<{ session: LogSession }>()
const router = useRouter()
const { waiting, failed, finishSession } = useLog()
const { userId } = useAuth()

const archer = computed(() => props.session.owner ?? Number(userId.value))
const totals = computed(() => sessionTotals(props.session))

function newEnd() {
  const s = props.session
  if (s.ends.length === 0) return void router.push(`/training/${s.id}/setup`)
  const d = nextEndDefaults(s)
  void router.push({ path: `/training/${s.id}/end`, query: { distance: d.distance_m, face: d.face, arrows: String(d.arrows_per_end) } })
}
// Back to the home screen, or for a coach to the archer's page.
function finish() {
  const s = props.session
  finishSession(s.id, true)
  void router.replace(s.owner ? { path: `/archers/${s.owner}`, query: { name: s.owner_name } } : '/')
}
</script>

<template>
  <div class="entry">
    <!-- Uploads that wait show as an icon, so the screen does not jump when they finish; only refused ones need the full banner. -->
    <SyncBanner v-if="failed.length > 0" />
    <div class="d-flex align-items-center gap-2">
      <h2 class="h5 m-0 flex-grow-1">{{ $t(sessionTypeKey(session.type)) }} · {{ new Date(session.started_at).toLocaleDateString() }}</h2>
      <IonIcon v-if="waiting > 0" :icon="cloudUploadOutline" class="muted" :title="$t('session.waiting', { n: waiting }, waiting)" />
    </div>
    <div class="muted">
      {{ session.location ? `${session.location} · ` : '' }}{{ $t('count.arrows', totals.arrows) }} · {{ $t('count.points', totals.score) }}
    </div>
    <div v-if="session.owner_name" class="muted">{{ $t('session.forArcher', { name: session.owner_name }) }}</div>
    <div v-else class="muted">{{ $t('session.equipment', { gear: gearLine(session.gear) || $t('session.noneChosen') }) }}</div>
    <div v-if="session.opened_by_name" class="muted">{{ $t('training.openedBy', { name: session.opened_by_name }) }}</div>
    <SessionEvent :session="session" />
    <SessionPlots fill :session="session" />
    <div v-if="totals.arrows === 0" class="flex-grow-1"></div>
    <UnattachedHint compact :owner="archer" :session="session" :event-id="session.event?.id" :name="session.owner_name" class="text-center" />
    <AppButton @click="newEnd">{{ $t('session.newEnd') }}</AppButton>
    <AppButton secondary @click="finish">{{ $t('session.finish') }}</AppButton>
  </div>
</template>
