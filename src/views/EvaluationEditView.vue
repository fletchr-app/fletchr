<script setup lang="ts">
import { IonButton, onIonViewWillEnter } from '@ionic/vue'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import AppButton from '@/components/AppButton.vue'
import AppPage from '@/components/AppPage.vue'
import ChipGroup from '@/components/ChipGroup.vue'
import ErrorText from '@/components/ErrorText.vue'
import FormField from '@/components/FormField.vue'
import RatingRow from '@/components/RatingRow.vue'
import { emptyRow, type Row, useEvaluationDraft } from '@/composables/useEvaluationDraft'
import { useAuth } from '@/composables/useAuth'
import type { components } from '@/lib/api-types'
import { errorMessage } from '@/lib/errors'
import { type Criterion, groupCriteria, toScores } from '@/lib/evaluation'
import { clock } from '@/lib/player'

type Template = components['schemas']['Template']
type Evaluation = components['schemas']['Evaluation']

// Rate an archer on a form: a coach's evaluation (?kind=coach, the default) or an archer's own (?kind=self). With ?edit=
// an evaluation that exists is changed. A criterion can point at a frame of a clip of the archer.
const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const { api, userId } = useAuth()
const { draft, picked, clear, startPick } = useEvaluationDraft()

const archerId = Number(route.query.archer)
const kind = (route.query.kind === 'self' ? 'self' : 'coach') as 'coach' | 'self'
const editId = route.query.edit ? Number(route.query.edit) : null
const name = route.query.name as string | undefined
const key = `${kind}-${archerId}-${editId ?? 'new'}`

const teams = ref<{ id: number; name: string }[]>([])
const templates = ref<Template[]>([])
const existing = ref<Evaluation | null>(null)
const loadError = ref<string | null>(null)
const error = ref<string | null>(null)
const busy = ref(false)
const ready = ref(false)

const teamId = computed({ get: () => draft.value?.teamId ?? null, set: (v) => draft.value && (draft.value.teamId = v) })
const template = computed(() => templates.value.find((x) => x.id === draft.value?.templateId) ?? null)
// The form to rate on: the one the evaluation was made with, or the newest version of the chosen one.
const form = computed<{ scale: number; criteria: Criterion[] } | null>(() =>
  existing.value ? { scale: existing.value.scale, criteria: existing.value.criteria as Criterion[] } : template.value ? { scale: template.value.scale, criteria: template.value.criteria as Criterion[] } : null,
)
const groups = computed(() => groupCriteria(form.value?.criteria ?? []))

async function loadTeams() {
  if (kind === 'self') return (await api.GET('/api/teams/')).data?.map((x) => ({ id: x.id, name: x.name })) ?? null
  return (await api.GET('/api/notes/teams/', { params: { query: { archer: archerId } } })).data ?? null
}
async function loadTemplates() {
  if (!teamId.value) return
  const { data } = await api.GET('/api/teams/{team_id}/evaluation-templates/', { params: { path: { team_id: teamId.value } } })
  templates.value = data ?? []
  if (draft.value && !templates.value.some((x) => x.id === draft.value!.templateId)) draft.value.templateId = templates.value[0]?.id ?? null
}
async function start() {
  loadError.value = null
  try {
    if (draft.value?.key !== key) {
      let base = { templateId: null as number | null, teamId: null as number | null, date: new Date().toISOString().slice(0, 10), comment: '', goals: '', visibility: 'coach_only' as 'shared' | 'coach_only', rows: {} as Record<string, Row> }
      if (editId !== null) {
        const { data } = await api.GET('/api/evaluations/{id}/', { params: { path: { id: editId } } })
        if (!data) return void (loadError.value = t('common.couldNotLoad'))
        existing.value = data
        base = {
          templateId: data.template_id,
          teamId: data.team ?? null,
          date: data.date ?? base.date,
          comment: data.comment ?? '',
          goals: data.goals ?? '',
          visibility: data.visibility ?? 'shared',
          rows: Object.fromEntries(data.scores.map((s) => [s.criterion, { rating: s.rating, comment: s.comment ?? '', media: s.media ?? null, frame: s.frame ?? null, timeMs: s.time_ms ?? null }])),
        }
      } else {
        teams.value = (await loadTeams()) ?? []
        base.teamId = teams.value[0]?.id ?? null
      }
      draft.value = { key, ...base }
    } else if (editId !== null && !existing.value) {
      const { data } = await api.GET('/api/evaluations/{id}/', { params: { path: { id: editId } } })
      existing.value = data ?? null
    }
    if (editId === null && teams.value.length === 0) teams.value = (await loadTeams()) ?? []
    if (draft.value!.teamId === null && teams.value[0]) draft.value!.teamId = teams.value[0].id
    await loadTemplates()
    if (picked.value && draft.value) {
      const p = picked.value
      draft.value.rows[p.criterion] = { ...(draft.value.rows[p.criterion] ?? emptyRow()), media: p.media, frame: p.frame, timeMs: p.timeMs }
      picked.value = null
    }
    ready.value = true
  } catch {
    loadError.value = t('common.serverNotReachable')
  }
}
// Each time the screen is shown: back from choosing a frame, the chosen frame is put in its row.
let first = true
onIonViewWillEnter(() => {
  if (first) return void (first = false, start())
  void start()
})
watch(teamId, () => void loadTemplates())

const row = (k: string): Row => (draft.value!.rows[k] ??= emptyRow())
const open = ref<Record<string, boolean>>({})
const frameText = (r: Row) => (r.media ? t('evaluations.frameLinked', { n: (r.frame ?? 0) + 1, time: clock((r.timeMs ?? 0) / 1000) }) : '')

function chooseFrame(criterion: string) {
  startPick(criterion, archerId, route.fullPath)
  void router.push({ path: '/media', query: { owner: String(archerId), name: name ?? '', pick: criterion } })
}
function clearFrame(k: string) {
  Object.assign(row(k), { media: null, frame: null, timeMs: null })
}

async function save() {
  const d = draft.value!
  if (!form.value) return
  busy.value = true
  error.value = null
  const scores = toScores(d.rows)
  try {
    const body = { date: d.date, comment: d.comment, goals: d.goals, scores, ...(kind === 'coach' ? { visibility: d.visibility } : {}) }
    const result =
      editId !== null
        ? await api.PATCH('/api/evaluations/{id}/', { params: { path: { id: editId } }, body })
        : await api.POST('/api/evaluations/', { body: { ...body, archer: archerId, kind, team: d.teamId ?? undefined, template: d.templateId ?? undefined } })
    if (result.data) {
      clear()
      void router.replace(`/evaluations/${result.data.id}`)
    } else error.value = errorMessage(result.error)
  } catch {
    error.value = t('common.serverNotReachable')
  }
  busy.value = false
}
function cancel() {
  clear()
  router.back()
}
const title = computed(() => (editId !== null ? t('evaluations.editTitle') : kind === 'self' ? t('evaluations.selfTitle') : t('evaluations.newTitle', { name: name ?? '' })))
const VISIBILITY = computed<{ value: 'shared' | 'coach_only'; label: string }[]>(() => [
  { value: 'shared', label: t('evaluations.shared') },
  { value: 'coach_only', label: t('evaluations.coachOnly') },
])
</script>

<template>
  <AppPage :title="title">
    <div class="screen">
      <ErrorText :message="loadError" />
      <template v-if="ready && draft">
        <ChipGroup v-if="!existing && teams.length > 1" :model-value="String(draft.teamId)" :label="$t('notes.team')" :options="teams.map((x) => ({ value: String(x.id), label: x.name }))" @update:model-value="teamId = Number($event)" />
        <ChipGroup
          v-if="!existing && templates.length > 1"
          :model-value="String(draft.templateId)"
          :label="$t('evaluations.form')"
          :options="templates.map((x) => ({ value: String(x.id), label: x.name }))"
          @update:model-value="draft.templateId = Number($event)"
        />
        <FormField v-model="draft.date" type="date" :label="$t('evaluations.date')" />
        <div v-if="existing" class="faint">{{ $t('evaluations.formVersion', { name: existing.template_name, version: existing.version }) }}</div>
        <div v-for="g in groups" :key="g.group" class="d-flex flex-column gap-3">
          <h2 v-if="g.group" class="h6 m-0">{{ g.group }}</h2>
          <div v-for="c in g.items" :key="c.key" class="d-flex flex-column gap-1">
            <div class="fw-semibold">{{ c.label }}</div>
            <div v-if="c.description" class="faint">{{ c.description }}</div>
            <RatingRow v-model="row(c.key).rating" :scale="form!.scale" :label="c.label" />
            <div v-if="c.low || c.high" class="faint d-flex justify-content-between"><span>{{ c.low }}</span><span>{{ c.high }}</span></div>
            <FormField v-if="open[c.key] || row(c.key).comment" v-model="row(c.key).comment" :label="$t('evaluations.comment')" multiline capitalize="sentences" />
            <div class="d-flex flex-wrap align-items-center gap-2">
              <IonButton v-if="!open[c.key] && !row(c.key).comment" fill="clear" size="small" class="m-0" @click="open[c.key] = true">{{ $t('evaluations.addComment') }}</IonButton>
              <template v-if="row(c.key).media">
                <span class="muted">{{ frameText(row(c.key)) }}</span>
                <IonButton fill="clear" size="small" class="m-0" @click="clearFrame(c.key)">{{ $t('evaluations.removeFrame') }}</IonButton>
              </template>
              <IonButton v-else fill="clear" size="small" class="m-0" @click="chooseFrame(c.key)">{{ $t('evaluations.linkFrame') }}</IonButton>
            </div>
          </div>
        </div>
        <FormField v-model="draft.comment" :label="$t('evaluations.overallComment')" multiline capitalize="sentences" />
        <FormField v-model="draft.goals" :label="$t('evaluations.goals')" multiline capitalize="sentences" />
        <ChipGroup v-if="kind === 'coach'" v-model="draft.visibility" :label="$t('notes.whoCanRead')" :options="VISIBILITY" />
        <ErrorText :message="error" />
        <AppButton :busy="busy" @click="save">{{ $t('common.save') }}</AppButton>
        <AppButton secondary @click="cancel">{{ $t('common.cancel') }}</AppButton>
      </template>
      <div v-else-if="!loadError">{{ $t('common.loading') }}</div>
    </div>
  </AppPage>
</template>
