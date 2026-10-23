<script setup lang="ts">
import { IonToggle } from '@ionic/vue'
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import AppButton from '@/components/AppButton.vue'
import ChipGroup from '@/components/ChipGroup.vue'
import ErrorText from '@/components/ErrorText.vue'
import FormField from '@/components/FormField.vue'
import type { FieldSpec } from '@/lib/equipment-fields'

type Item = { id: number; is_active?: boolean; revision_number: number } & Record<string, unknown>
type Revision = { id: number; number: number; created_at: string } & Record<string, unknown>
type Values = Record<string, string>

/** What the screen needs from the API; each equipment kind supplies its own typed implementation. */
export type EquipmentAdapter = {
  load: (id: number) => Promise<Item | null>
  revisions: (id: number) => Promise<Revision[]>
  // Save and delete return an error message, or null on success.
  create: (payload: Record<string, unknown>) => Promise<string | null>
  update: (id: number, payload: Record<string, unknown>) => Promise<string | null>
  remove: (id: number) => Promise<string | null>
}

const props = defineProps<{ kind: 'bow' | 'arrowSet'; fields: FieldSpec[]; adapter: EquipmentAdapter }>()

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const param = route.params.id as string
const id = param === 'new' ? null : Number(param)

const toText = (value: unknown) => (value == null ? '' : String(value))

function toPayload(values: Values, active: boolean) {
  const payload: Record<string, unknown> = { is_active: active }
  for (const f of props.fields) {
    const v = values[f.key]?.trim() ?? ''
    if (f.kind === 'decimal') payload[f.key] = v === '' ? null : v.replace(',', '.')
    else if (f.kind === 'integer') payload[f.key] = v === '' ? null : Number(v)
    else payload[f.key] = v
  }
  return payload
}

const state = ref<'loading' | 'failed' | 'ready'>(id === null ? 'ready' : 'loading')
const revisions = ref<Revision[]>([])
const values = ref<Values>(Object.fromEntries(props.fields.map((f) => [f.key, ''])))
const isActive = ref(true)
const error = ref<string | null>(null)
const busy = ref(false)
const confirmDelete = ref(false)

onMounted(async () => {
  if (id === null) return
  try {
    const [item, revs] = await Promise.all([props.adapter.load(id), props.adapter.revisions(id)])
    if (!item) return (state.value = 'failed')
    values.value = Object.fromEntries(props.fields.map((f) => [f.key, toText(item[f.key])]))
    isActive.value = item.is_active ?? true
    revisions.value = revs
    state.value = 'ready'
  } catch {
    state.value = 'failed'
  }
})

async function run(action: () => Promise<string | null>) {
  busy.value = true
  error.value = null
  try {
    const message = await action()
    if (message) error.value = message
    else router.back()
  } catch {
    error.value = t('common.serverNotReachable')
  }
  busy.value = false
}

const save = () =>
  run(() => {
    const payload = toPayload(values.value, isActive.value)
    return id === null ? props.adapter.create(payload) : props.adapter.update(id, payload)
  })

// Newest first; each entry shows what changed compared with the revision before it.
function changes(rev: Revision, prev: Revision | undefined) {
  if (!prev) return [t('equipment.created')]
  return props.fields
    .filter((f) => toText(rev[f.key]) !== toText(prev[f.key]))
    .map((f) => `${t(`equipment.field.${f.key}`)}: ${toText(prev[f.key]) || '–'} → ${toText(rev[f.key]) || '–'}`)
}
</script>

<template>
  <div class="screen">
    <div v-if="state === 'loading'">{{ $t('common.loading') }}</div>
    <ErrorText v-else-if="state === 'failed'" :message="kind === 'bow' ? $t('equipment.couldNotLoadBow') : $t('equipment.couldNotLoadArrowSet')" />
    <template v-else>
      <template v-for="f in fields" :key="f.key">
        <ChipGroup
          v-if="f.kind === 'choice'"
          v-model="values[f.key]"
          :label="$t(`equipment.field.${f.key}`)"
          :options="(f.options ?? []).map((o) => ({ value: o, label: $t(`equipment.bowType.${o}`) }))"
        />
        <FormField
          v-else
          v-model="values[f.key]"
          :label="f.unit ? `${$t(`equipment.field.${f.key}`)} (${f.unit})` : $t(`equipment.field.${f.key}`)"
          :inputmode="f.kind === 'decimal' ? 'decimal' : f.kind === 'integer' ? 'numeric' : 'text'"
          :multiline="f.kind === 'multiline'"
          :capitalize="f.kind === 'text' || f.kind === 'multiline' ? 'sentences' : 'none'"
        />
      </template>
      <IonToggle v-model="isActive" class="ion-text-wrap">{{ $t('equipment.active') }}</IonToggle>
      <ErrorText :message="error" />
      <AppButton :busy="busy" @click="save">{{ id === null ? (kind === 'bow' ? $t('equipment.addBowButton') : $t('equipment.addArrowSetButton')) : $t('common.save') }}</AppButton>
      <AppButton v-if="id !== null" secondary @click="confirmDelete ? run(() => adapter.remove(id!)) : (confirmDelete = true)">
        {{ confirmDelete ? $t('equipment.tapAgainDelete') : $t('common.delete') }}
      </AppButton>
      <div v-if="revisions.length > 0" class="d-flex flex-column gap-2 mt-3">
        <h2 class="h6 m-0">{{ $t('equipment.history') }}</h2>
        <div v-for="(rev, i) in revisions" :key="rev.id">
          <div class="fw-semibold">#{{ rev.number }} · {{ new Date(rev.created_at).toLocaleString() }}</div>
          <div v-for="c in changes(rev, revisions[i + 1])" :key="c" class="muted">{{ c }}</div>
        </div>
      </div>
    </template>
  </div>
</template>
