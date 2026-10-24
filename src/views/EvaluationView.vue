<script setup lang="ts">
import { onIonViewWillEnter } from '@ionic/vue'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import AppButton from '@/components/AppButton.vue'
import AppPage from '@/components/AppPage.vue'
import ChipGroup from '@/components/ChipGroup.vue'
import ErrorText from '@/components/ErrorText.vue'
import { useAuth } from '@/composables/useAuth'
import { useRemote } from '@/composables/useRemote'
import { average, type Criterion, groupCriteria } from '@/lib/evaluation'
import { errorMessage } from '@/lib/errors'
import { clock } from '@/lib/player'

// One evaluation as it was filled in: every criterion with its rating, comment and linked frame, then the overall
// comment and the goals. The author can change who reads it, edit it, or delete it.
const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const { api } = useAuth()
const id = Number(route.params.id)

const evaluation = useRemote(async () => (await api.GET('/api/evaluations/{id}/', { params: { path: { id } } })).data ?? null)
let first = true
onIonViewWillEnter(() => (first ? (first = false) : evaluation.reload()))

const e = computed(() => evaluation.data.value)
const criteria = computed(() => (e.value?.criteria ?? []) as Criterion[])
const scoreOf = (key: string) => e.value?.scores.find((s) => s.criterion === key)
const groups = computed(() =>
  groupCriteria(criteria.value)
    .map((g) => ({ group: g.group, items: g.items.filter((c) => scoreOf(c.key)) }))
    .filter((g) => g.items.length > 0),
)
const error = ref<string | null>(null)
const confirmDelete = ref(false)

const VISIBILITY = computed<{ value: 'shared' | 'coach_only'; label: string }[]>(() => [
  { value: 'shared', label: t('evaluations.shared') },
  { value: 'coach_only', label: t('evaluations.coachOnly') },
])
async function setVisibility(value: 'shared' | 'coach_only') {
  error.value = null
  try {
    const { data, error: failure } = await api.PATCH('/api/evaluations/{id}/', { params: { path: { id } }, body: { visibility: value } })
    if (data) evaluation.reload()
    else error.value = errorMessage(failure)
  } catch {
    error.value = t('common.serverNotReachable')
  }
}
async function remove() {
  if (!confirmDelete.value) return (confirmDelete.value = true)
  const { response } = await api.DELETE('/api/evaluations/{id}/', { params: { path: { id } } }).catch(() => ({ response: null }))
  if (!response || !(response.ok || response.status === 404)) return (error.value = t('common.nothingDeleted'))
  router.back()
}
const frameLink = (s: { media?: string | null; frame?: number | null }) => (s.media ? { path: `/media/${s.media}`, query: { frame: String(s.frame ?? 0) } } : null)
const frameText = (s: { frame?: number | null; time_ms?: number | null }) => t('evaluations.frameLinked', { n: (s.frame ?? 0) + 1, time: clock((s.time_ms ?? 0) / 1000) })
</script>

<template>
  <AppPage :title="e ? new Date(e.date ?? e.created_at).toLocaleDateString() : $t('evaluations.title')">
    <div class="screen">
      <ErrorText :message="evaluation.error.value" />
      <template v-if="e">
        <div class="muted">
          {{ e.kind === 'self' ? $t('evaluations.selfBy', { name: e.archer_name }) : $t('evaluations.coachBy', { name: e.author_name }) }} · {{ e.template_name }} ({{ $t('evaluations.version', { n: e.version }) }})
          <template v-if="average(e.scores) !== null"> · Ø {{ average(e.scores) }} / {{ e.scale }}</template>
        </div>
        <div v-for="g in groups" :key="g.group" class="d-flex flex-column gap-2">
          <h2 v-if="g.group" class="h6 m-0">{{ g.group }}</h2>
          <div v-for="c in g.items" :key="c.key" class="d-flex flex-column">
            <div class="d-flex justify-content-between gap-2">
              <span>{{ c.label }}</span>
              <span class="fw-semibold" style="white-space: nowrap">{{ scoreOf(c.key)!.rating }} / {{ e.scale }}</span>
            </div>
            <div v-if="scoreOf(c.key)!.comment" class="muted" style="white-space: pre-wrap">{{ scoreOf(c.key)!.comment }}</div>
            <RouterLink v-if="frameLink(scoreOf(c.key)!)" :to="frameLink(scoreOf(c.key)!)!">{{ frameText(scoreOf(c.key)!) }}</RouterLink>
          </div>
        </div>
        <div v-if="e.comment">
          <div class="fw-semibold">{{ $t('evaluations.overallComment') }}</div>
          <div style="white-space: pre-wrap">{{ e.comment }}</div>
        </div>
        <div v-if="e.goals">
          <div class="fw-semibold">{{ $t('evaluations.goals') }}</div>
          <div style="white-space: pre-wrap">{{ e.goals }}</div>
        </div>
        <template v-if="e.can_edit && e.kind === 'coach'">
          <ChipGroup :model-value="e.visibility ?? 'coach_only'" :label="$t('notes.whoCanRead')" :options="VISIBILITY" @update:model-value="setVisibility" />
          <div class="faint">{{ $t('evaluations.visibilityHint') }}</div>
        </template>
        <ErrorText :message="error" />
        <AppButton v-if="e.can_edit" :router-link="`/evaluate?archer=${e.archer}&kind=${e.kind}&edit=${e.id}&name=${encodeURIComponent(e.archer_name)}`">{{ $t('evaluations.edit') }}</AppButton>
        <AppButton v-if="e.can_delete" secondary @click="remove">{{ confirmDelete ? $t('evaluations.deleteConfirm') : $t('common.delete') }}</AppButton>
      </template>
    </div>
  </AppPage>
</template>
