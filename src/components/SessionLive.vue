<script setup lang="ts">
import { IonIcon } from '@ionic/vue'
import { cloudUploadOutline } from 'ionicons/icons'
import { computed } from 'vue'
import { useRouter } from 'vue-router'

import EndRows from '@/components/EndRows.vue'
import SessionEvent from '@/components/SessionEvent.vue'
import SessionPlots from '@/components/SessionPlots.vue'
import SyncBanner from '@/components/SyncBanner.vue'
import UnattachedHint from '@/components/UnattachedHint.vue'
import { useAuth } from '@/composables/useAuth'
import { useLog } from '@/composables/useLog'
import { gearLine, type LogEnd, type LogSession, sessionTotals, sessionTypeKey } from '@/lib/log-model'

// A session with ends that is being shot, between the ends (the ends themselves follow one another on the end screen):
// the arrows so far and the list of ends (tap to edit). Scrolls; Finish and New end are fixed to the bottom edge
// (`SessionLiveButtons`). Photos, notes, changing the setup and deleting are in the app bar (`SessionActions`).
const props = defineProps<{ session: LogSession }>()
const router = useRouter()
const { waiting, failed } = useLog()
const { userId } = useAuth()

const archer = computed(() => props.session.owner ?? Number(userId.value))
const totals = computed(() => sessionTotals(props.session))

function edit(end: LogEnd) {
  void router.push({
    path: `/training/${props.session.id}/end`,
    query: { distance: end.distance_m, face: end.face, arrows: String(end.arrows_per_end), end: end.id },
  })
}
</script>

<template>
  <div class="screen">
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
    <UnattachedHint compact :owner="archer" :session="session" :event-id="session.event?.id" :name="session.owner_name" />
    <SessionPlots :session="session" />
    <template v-if="session.ends.length > 0">
      <h3 class="h6 m-0">{{ $t('session.ends') }}</h3>
      <EndRows :ends="session.ends" clickable @select="edit" />
    </template>
  </div>
</template>
