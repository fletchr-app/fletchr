<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'

import DistributionBars from '@/components/DistributionBars.vue'
import EndRows from '@/components/EndRows.vue'
import EndScoreBars from '@/components/EndScoreBars.vue'
import SessionDetailsText from '@/components/SessionDetailsText.vue'
import SessionEvent from '@/components/SessionEvent.vue'
import SessionPlots from '@/components/SessionPlots.vue'
import SyncBanner from '@/components/SyncBanner.vue'
import UnattachedHint from '@/components/UnattachedHint.vue'
import { useAuth } from '@/composables/useAuth'
import { gearLine, type LogEnd, type LogSession, sessionTypeKey } from '@/lib/log-model'
import { distributionOf, endFigures, figuresOf, halves } from '@/lib/session-stats'

// A finished session with ends: what the archer shot, as figures, charts and the list of ends. It scrolls.
const props = defineProps<{ session: LogSession }>()
const router = useRouter()
const { userId } = useAuth()

const archer = computed(() => props.session.owner ?? Number(userId.value))
const figures = computed(() => figuresOf(props.session))
const perEnd = computed(() => endFigures(props.session))
const distribution = computed(() => distributionOf(props.session))
const halfAverages = computed(() => halves(props.session))
const one = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })

function edit(end: LogEnd) {
  void router.push({
    path: `/training/${props.session.id}/end`,
    query: { distance: end.distance_m, face: end.face, arrows: String(end.arrows_per_end), end: end.id },
  })
}
</script>

<template>
  <div class="screen">
    <SyncBanner />
    <h2 class="h5 m-0">{{ $t(sessionTypeKey(session.type)) }} · {{ new Date(session.started_at).toLocaleDateString() }}</h2>
    <div class="muted">{{ session.location ? `${session.location} · ` : '' }}{{ $t('session.finished') }}</div>
    <div v-if="session.owner_name" class="muted">{{ $t('session.forArcher', { name: session.owner_name }) }}</div>
    <div v-else class="muted">{{ $t('session.equipment', { gear: gearLine(session.gear) || $t('session.noneChosen') }) }}</div>
    <div v-if="session.opened_by_name" class="muted">{{ $t('training.openedBy', { name: session.opened_by_name }) }}</div>
    <SessionEvent :session="session" />

    <div v-if="figures.arrows === 0">{{ $t('summary.noArrows') }}</div>
    <template v-else>
      <div class="figures">
        <div class="figure"><span class="number tabular">{{ figures.score }}</span><span class="muted">{{ $t('summary.points') }}</span></div>
        <div class="figure"><span class="number tabular">{{ figures.arrows }}</span><span class="muted">{{ $t('summary.arrows') }}</span></div>
        <div class="figure"><span class="number tabular">{{ one(figures.average) }}</span><span class="muted">{{ $t('summary.perArrow') }}</span></div>
        <div class="figure"><span class="number tabular">{{ one(figures.perEnd) }}</span><span class="muted">{{ $t('summary.perEnd') }}</span></div>
        <div class="figure">
          <span class="number tabular">{{ figures.best }}{{ figures.xs > 0 ? ` (${figures.xs} X)` : '' }}</span>
          <span class="muted">{{ $t('summary.best', { value: figures.bestValue }) }}</span>
        </div>
        <div class="figure"><span class="number tabular">{{ figures.misses }}</span><span class="muted">{{ $t('summary.misses') }}</span></div>
      </div>
      <EndScoreBars :ends="perEnd" />
      <div v-if="halfAverages" class="muted">{{ $t('summary.halves', { first: one(halfAverages.first), second: one(halfAverages.second) }) }}</div>
      <DistributionBars :distribution="distribution" />
      <SessionPlots :session="session" />
    </template>

    <SessionDetailsText :details="session.details" />
    <UnattachedHint :owner="archer" :session="session" :event-id="session.event?.id" :name="session.owner_name" />
    <template v-if="session.ends.length > 0">
      <h3 class="h6 m-0">{{ $t('session.ends') }}</h3>
      <EndRows :ends="session.ends" clickable @select="edit" />
    </template>
  </div>
</template>

<style scoped>
.figures { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px 8px; }
.figure { display: flex; flex-direction: column; }
.number { font-size: 22px; font-weight: 600; }
</style>
