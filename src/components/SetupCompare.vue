<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import ChipGroup from '@/components/ChipGroup.vue'
import { useUnits } from '@/composables/useUnits'
import type { components } from '@/lib/api-types'
import { type CentreWords, describeCentre } from '@/lib/group'
import { bySetup, comparable } from '@/lib/setup-compare'

type Group = components['schemas']['ScoreStats']

// Two setups side by side on one face and distance, for example before and after a limb change. The numbers come
// from the session points of the statistics; the setups are told apart as the server recorded them (a bow revision
// with an arrow set revision, exactly as they were).
const props = defineProps<{ group: Group; labels: Record<number, string> }>()
const { t } = useI18n()
const { units, formatLength, formatDistance } = useUnits()
const words = computed<CentreWords>(() => ({ left: t('plots.left'), right: t('plots.right'), low: t('plots.low'), high: t('plots.high'), middle: t('plots.middle') }))

const all = computed(() => bySetup(props.group.sessions))
const keyOf = (setup: number | null) => String(setup)
const labelOf = (setup: number | null) => (setup === null ? t('stats.setupNone') : (props.labels[setup] ?? t('stats.setupUnknown')))

// The setup used last is B, the one before it A, until the reader picks others.
const pickedA = ref<string | null>(null)
const pickedB = ref<string | null>(null)
const b = computed(() => all.value.find((s) => keyOf(s.setup) === pickedB.value) ?? all.value.find((s) => keyOf(s.setup) !== pickedA.value) ?? all.value[0]!)
const a = computed(() => all.value.find((s) => keyOf(s.setup) === pickedA.value && s !== b.value) ?? all.value.find((s) => s !== b.value) ?? all.value[0]!)
const choiceA = computed({ get: () => keyOf(a.value.setup), set: (value: string) => (pickedA.value = value) })
const choiceB = computed({ get: () => keyOf(b.value.setup), set: (value: string) => (pickedB.value = value) })
const optionsFor = (other: string) => all.value.filter((s) => keyOf(s.setup) !== other).map((s) => ({ value: keyOf(s.setup), label: labelOf(s.setup) }))

const radius = computed(() => props.group.radius_cm)
const cm = (fraction: number | null) => (fraction === null ? null : fraction * radius.value)
const signed = (n: number, text: string) => (n > 0 ? `+${text}` : text)
const dash = '–'
const spreadText = (s: ReturnType<typeof bySetup>[number]) => (s.spread === null ? dash : formatLength(cm(s.spread)!))
const centreText = (s: ReturnType<typeof bySetup>[number]) =>
  s.centreX === null || s.centreY === null ? dash : describeCentre({ n: s.plotted, cx: s.centreX, cy: s.centreY, meanRadius: s.spread ?? 0 }, radius.value, words.value, units.value)
const averageChange = computed(() => b.value.average - a.value.average)
const spreadChange = computed(() => (a.value.spread === null || b.value.spread === null ? null : cm(b.value.spread - a.value.spread)!))
</script>

<template>
  <div v-if="comparable(all)" class="chart-card">
    <div class="chart-title">{{ $t('stats.setupTitle') }} · {{ group.face_name }} · {{ formatDistance(group.distance_m) }}</div>
    <ChipGroup v-model="choiceA" :label="$t('stats.setupA')" :options="optionsFor(choiceB)" />
    <ChipGroup v-model="choiceB" :label="$t('stats.setupB')" :options="optionsFor(choiceA)" />
    <div class="compare-grid">
      <span></span><span class="compare-head">A</span><span class="compare-head">B</span><span class="compare-head">{{ $t('stats.setupChange') }}</span>
      <span>{{ $t('stats.setupSessions') }}</span><span class="tabular">{{ a.sessions }}</span><span class="tabular">{{ b.sessions }}</span><span></span>
      <span>{{ $t('stats.setupArrows') }}</span><span class="tabular">{{ a.arrows }}</span><span class="tabular">{{ b.arrows }}</span><span></span>
      <span>{{ $t('stats.setupAverage') }}</span><span class="tabular">{{ a.average.toFixed(2) }}</span><span class="tabular">{{ b.average.toFixed(2) }}</span>
      <span class="tabular">{{ signed(averageChange, averageChange.toFixed(2)) }}</span>
      <span>{{ $t('stats.setupSpread') }}</span><span class="tabular">{{ spreadText(a) }}</span><span class="tabular">{{ spreadText(b) }}</span>
      <span class="tabular">{{ spreadChange === null ? dash : signed(spreadChange, formatLength(spreadChange)) }}</span>
    </div>
    <div>{{ $t('stats.setupCentre') }}</div>
    <div class="d-flex flex-column">
      <span><b>A</b> {{ centreText(a) }}</span>
      <span><b>B</b> {{ centreText(b) }}</span>
    </div>
    <div style="color: var(--chart-muted)">{{ $t('stats.setupNote') }}</div>
  </div>
</template>

<style scoped>
.compare-grid { display: grid; grid-template-columns: 1fr 5em 5em 5em; gap: 2px 8px; align-items: baseline; }
.compare-grid > .tabular, .compare-head { text-align: right; }
.compare-head { font-weight: 600; color: var(--chart-primary); }
</style>
