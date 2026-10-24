<script setup lang="ts">
import { IonButton } from '@ionic/vue'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'

import AppButton from '@/components/AppButton.vue'
import AppPage from '@/components/AppPage.vue'
import ErrorText from '@/components/ErrorText.vue'
import FormField from '@/components/FormField.vue'
import { useAuth } from '@/composables/useAuth'
import { useRemote } from '@/composables/useRemote'
import type { components } from '@/lib/api-types'
import { errorMessage } from '@/lib/errors'
import { type Criterion, moved } from '@/lib/evaluation'

type Template = components['schemas']['Template']
type Row = { key?: string; label: string; group: string; description: string; low: string; high: string }

// The forms of a team: coaches add forms and change them. Every change makes a new version, so evaluations made
// before keep the form they were made with. A criterion keeps its key, so it can be followed over time.
const { t } = useI18n()
const route = useRoute()
const { api } = useAuth()
const teamId = Number(route.params.id)

const forms = useRemote(async () => (await api.GET('/api/teams/{team_id}/evaluation-templates/', { params: { path: { team_id: teamId } } })).data ?? null)
const editing = ref<{ id: number | null; name: string; rows: Row[] } | null>(null)
const busy = ref(false)
const error = ref<string | null>(null)
const confirmDelete = ref(false)

const rowOf = (c: Partial<Criterion>): Row => ({ key: c.key, label: c.label ?? '', group: c.group ?? '', description: c.description ?? '', low: c.low ?? '', high: c.high ?? '' })
function edit(form: Template) {
  error.value = null
  confirmDelete.value = false
  editing.value = { id: form.id, name: form.name, rows: (form.criteria as Criterion[]).map(rowOf) }
}
function create() {
  error.value = null
  editing.value = { id: null, name: '', rows: [rowOf({})] }
}
const lastGroup = computed(() => editing.value?.rows.at(-1)?.group ?? '')
function addRow() {
  editing.value!.rows.push(rowOf({ group: lastGroup.value }))
}
function move(i: number, to: number) {
  editing.value!.rows = moved(editing.value!.rows, i, to)
}
function drop(i: number) {
  editing.value!.rows.splice(i, 1)
}

async function save() {
  const f = editing.value!
  busy.value = true
  error.value = null
  const body = { name: f.name, criteria: f.rows.filter((r) => r.label.trim()).map((r) => ({ ...r, label: r.label.trim() })) }
  try {
    const result =
      f.id === null
        ? await api.POST('/api/teams/{team_id}/evaluation-templates/', { params: { path: { team_id: teamId } }, body })
        : await api.PUT('/api/evaluation-templates/{id}/', { params: { path: { id: f.id } }, body })
    if (result.data) {
      editing.value = null
      forms.reload()
    } else error.value = errorMessage(result.error)
  } catch {
    error.value = t('common.serverNotReachable')
  }
  busy.value = false
}
async function remove() {
  if (!confirmDelete.value) return (confirmDelete.value = true)
  const { response, error: failure } = await api.DELETE('/api/evaluation-templates/{id}/', { params: { path: { id: editing.value!.id! } } }).catch(() => ({ response: null, error: null }))
  if (response?.ok) {
    editing.value = null
    forms.reload()
  } else error.value = response ? errorMessage(failure) : t('common.nothingDeleted')
  confirmDelete.value = false
}
</script>

<template>
  <AppPage :title="$t('evaluations.formsTitle')">
    <div class="screen">
      <ErrorText :message="forms.error.value" />
      <template v-if="!editing">
        <div v-if="forms.loading.value && !forms.data.value">{{ $t('common.loading') }}</div>
        <div v-for="f in forms.data.value" :key="f.id" class="d-flex align-items-center justify-content-between gap-2">
          <div>
            <div class="fw-semibold">{{ f.name }}</div>
            <div class="faint">{{ $t('evaluations.formSummary', { n: f.criteria.length, version: f.version }) }}</div>
          </div>
          <IonButton fill="outline" size="small" @click="edit(f)">{{ $t('notes.edit') }}</IonButton>
        </div>
        <AppButton @click="create">{{ $t('evaluations.newForm') }}</AppButton>
        <div class="faint">{{ $t('evaluations.versionHint') }}</div>
      </template>
      <template v-else>
        <FormField v-model="editing.name" :label="$t('evaluations.formName')" capitalize="sentences" />
        <div v-for="(r, i) in editing.rows" :key="r.key ?? `new-${i}`" class="d-flex flex-column gap-2 criterion">
          <FormField v-model="r.label" :label="$t('evaluations.criterion')" capitalize="sentences" />
          <FormField v-model="r.group" :label="$t('evaluations.group')" capitalize="sentences" />
          <FormField v-model="r.description" :label="$t('evaluations.description')" capitalize="sentences" />
          <div class="d-flex gap-2">
            <FormField v-model="r.low" :label="$t('evaluations.low')" capitalize="sentences" />
            <FormField v-model="r.high" :label="$t('evaluations.high')" capitalize="sentences" />
          </div>
          <div class="d-flex gap-2">
            <IonButton fill="clear" size="small" class="m-0" :disabled="i === 0" @click="move(i, i - 1)">{{ $t('evaluations.up') }}</IonButton>
            <IonButton fill="clear" size="small" class="m-0" :disabled="i === editing.rows.length - 1" @click="move(i, i + 1)">{{ $t('evaluations.down') }}</IonButton>
            <IonButton fill="clear" size="small" class="m-0" color="danger" @click="drop(i)">{{ $t('evaluations.removeCriterion') }}</IonButton>
          </div>
        </div>
        <AppButton secondary @click="addRow">{{ $t('evaluations.addCriterion') }}</AppButton>
        <ErrorText :message="error" />
        <AppButton :busy="busy" @click="save">{{ $t('common.save') }}</AppButton>
        <AppButton secondary @click="editing = null">{{ $t('common.cancel') }}</AppButton>
        <AppButton v-if="editing.id !== null" secondary @click="remove">{{ confirmDelete ? $t('evaluations.deleteFormConfirm') : $t('evaluations.deleteForm') }}</AppButton>
      </template>
    </div>
  </AppPage>
</template>

<style scoped>
.criterion {
  padding-bottom: 12px;
  border-bottom: 1px solid color-mix(in srgb, currentcolor 15%, transparent);
}
</style>
