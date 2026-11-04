<script setup lang="ts">
import AppPage from '@/components/AppPage.vue'
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'

import AppButton from '@/components/AppButton.vue'
import ChipGroup from '@/components/ChipGroup.vue'
import SessionEvent from '@/components/SessionEvent.vue'
import SessionDetailsText from '@/components/SessionDetailsText.vue'
import SessionActions from '@/components/SessionActions.vue'
import SessionLive from '@/components/SessionLive.vue'
import SessionSummary from '@/components/SessionSummary.vue'
import UnattachedHint from '@/components/UnattachedHint.vue'
import SyncBanner from '@/components/SyncBanner.vue'
import VolumeLog from '@/components/VolumeLog.vue'
import { useAuth } from '@/composables/useAuth'
import { useLog } from '@/composables/useLog'
import { gearLine, type SessionType, sessionTotals, sessionTypeKey, usesEnds } from '@/lib/log-model'
import { canReopen } from '@/lib/session-time'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const { loaded, sessions, finishSession, deleteSession, setType, renamed } = useLog()
const { userId } = useAuth()
const archer = computed(() => session.value?.owner ?? Number(userId.value))

const sessionId = route.params.id as string
// Photos of this session; for an archer without an account, the coach adds them for that archer.
const mediaLink = computed(() => ({
  path: '/media',
  query: { session: sessionId, ...(session.value?.owner ? { owner: session.value.owner, name: session.value.owner_name } : {}) },
}))
const session = computed(() => sessions.value.find((s) => s.id === sessionId))
// The server merged this session into another one: follow it (a coach's copy of an archer's session is read on the server).
watch(
  () => renamed.value[sessionId],
  (to) => to && void router.replace(sessions.value.some((s) => s.id === to) ? `/training/${to}` : `/sessions/${to}`),
)
// The archer chooses the type of a session a coach opened when starting the results.
const TYPES = computed<{ value: SessionType; label: string }[]>(() =>
  (['scoring', 'competition', 'volume', 'technique'] as const).map((value) => ({ value, label: t(sessionTypeKey(value)) })),
)
const chosen = computed({ get: () => '' as SessionType, set: (type) => setType(sessionId, type) })
// Only the session being shot is a screen that does not scroll; the finished one has more to show.
const live = computed(() => !!session.value && usesEnds(session.value.type) && !session.value.ended_at)
const totals = computed(() => (session.value ? sessionTotals(session.value) : null))

// A session left before anything was entered would only clutter the list. Its photos page belongs to it.
onBeforeRouteLeave((to) => {
  const s = session.value
  const staying = to.path.startsWith(`/training/${s?.id}`) || (to.path === '/media' && to.query.session === s?.id)
  if (s && !staying && !s.keep && s.ends.length === 0 && s.volume.length === 0) deleteSession(s.id)
})

// A session of an earlier day stays finished: open, it would show as live and get a capped window on the server.
const canToggle = computed(() => !session.value?.ended_at || canReopen(session.value))
// Sessions without ends finish here (the ends sessions finish in `SessionLive`); a coach goes back to the archer's page.
function finish() {
  const s = session.value!
  finishSession(s.id, !s.ended_at)
  if (!s.ended_at) void router.replace(s.owner ? { path: `/archers/${s.owner}`, query: { name: s.owner_name } } : '/')
}
</script>

<template>
  <AppPage :title="$t('session.title')" :fixed="live">
    <template v-if="session && totals" #actions>
      <SessionActions :session="session" :media-link="mediaLink" :can-reopen="canToggle" @reopen="finishSession(session.id, false)" />
    </template>
    <div v-if="!session || !totals" class="screen">{{ loaded ? $t('session.notOnDevice') : $t('common.loading') }}</div>
    <!-- Opened without a type: the archer chooses it before adding results. -->
    <div v-else-if="!session.type" class="screen">
      <SyncBanner />
      <h2 class="h5 m-0">{{ $t(sessionTypeKey(session.type)) }} · {{ new Date(session.started_at).toLocaleDateString() }}</h2>
      <div class="muted">{{ session.location ? `${session.location} · ` : '' }}{{ session.ended_at ? $t('session.finished') : $t('training.inProgress') }}</div>
      <div v-if="session.owner_name" class="muted">{{ $t('session.forArcher', { name: session.owner_name }) }}</div>
      <div v-if="session.opened_by_name" class="muted">{{ $t('training.openedBy', { name: session.opened_by_name }) }}</div>
      <SessionEvent :session="session" />
      <UnattachedHint :owner="archer" :session="session" :event-id="session.event?.id" :name="session.owner_name" />
      <ChipGroup v-if="!session.noResults" v-model="chosen" :label="$t('training.chooseType')" :options="TYPES" />
      <AppButton v-if="canToggle" secondary @click="finish">{{ session.ended_at ? $t('session.reopenSession') : $t('session.finish') }}</AppButton>
    </div>
    <SessionLive v-else-if="live" :session="session" />
    <SessionSummary v-else-if="usesEnds(session.type)" :session="session" />
    <div v-else class="screen">
      <SyncBanner />
      <h2 class="h5 m-0">{{ $t(sessionTypeKey(session.type)) }} · {{ new Date(session.started_at).toLocaleDateString() }}</h2>
      <div class="muted">
        {{ session.location ? `${session.location} · ` : '' }}{{ $t('count.arrows', totals.arrows) }}{{ session.ended_at ? ` · ${$t('session.finished')}` : '' }}
      </div>
      <div v-if="session.owner_name" class="muted">{{ $t('session.forArcher', { name: session.owner_name }) }}</div>
      <div v-else class="muted">{{ $t('session.equipment', { gear: gearLine(session.gear) || $t('session.noneChosen') }) }}</div>
      <SessionEvent :session="session" />
      <SessionDetailsText :details="session.details" />
      <UnattachedHint :owner="archer" :session="session" :event-id="session.event?.id" :name="session.owner_name" />
      <VolumeLog :session="session" />
      <AppButton v-if="canToggle" secondary @click="finish">{{ session.ended_at ? $t('session.reopenSession') : $t('session.finish') }}</AppButton>
    </div>
  </AppPage>
</template>
