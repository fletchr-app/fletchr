<script setup lang="ts">
import { IonToggle } from '@ionic/vue'
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import AppButton from '@/components/AppButton.vue'
import ChipGroup from '@/components/ChipGroup.vue'
import ErrorText from '@/components/ErrorText.vue'
import FormField from '@/components/FormField.vue'
import { useEquipment } from '@/composables/useEquipment'
import { emptyValues, type FieldSpec } from '@/lib/equipment-fields'
import type { EquipmentKind, StoredRevision, Values } from '@/lib/equipment-store'

type FormValues = Record<string, string>

const props = defineProps<{ kind: EquipmentKind; fields: FieldSpec[] }>()

// The form works on the copy on the device, so it also works without a connection; the change goes up when there is one.
const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const { find, save: saveItem, remove, revisionsOf } = useEquipment()
const param = route.params.id as string
const uid = param === 'new' ? null : param

const toText = (value: unknown) => (value == null ? '' : String(value))

function toPayload(form: FormValues): Values {
  const payload: Values = {}
  for (const f of props.fields) {
    const v = form[f.key]?.trim() ?? ''
    if (f.kind === 'decimal') payload[f.key] = v === '' ? null : v.replace(',', '.')
    else if (f.kind === 'integer') payload[f.key] = v === '' ? null : Number(v)
    else payload[f.key] = v
  }
  return payload
}

const failed = ref(false)
const revisions = ref<StoredRevision[]>([])
const values = ref<FormValues>(emptyValues(props.fields))
const isActive = ref(true)
const error = ref<string | null>(null)
const confirmDelete = ref(false)

onMounted(async () => {
  if (uid === null) return
  const item = find(props.kind, uid)
  if (!item) return (failed.value = true)
  values.value = Object.fromEntries(props.fields.map((f) => [f.key, toText(item.values[f.key])]))
  isActive.value = item.is_active
  revisions.value = item.revisions
  // The server's history, when it can be reached, with what is still waiting to upload on top.
  revisions.value = await revisionsOf(props.kind, uid)
})

function save() {
  const payload = toPayload(values.value)
  if (!payload.name) return (error.value = t('equipment.nameRequired'))
  saveItem(props.kind, uid, payload, isActive.value)
  router.back()
}

function removeItem() {
  remove(props.kind, uid!)
  router.back()
}

// Newest first; each entry shows what changed compared with the revision before it.
function changes(rev: StoredRevision, prev: StoredRevision | undefined) {
  if (!prev) return [t('equipment.created')]
  return props.fields
    .filter((f) => toText(rev.values[f.key]) !== toText(prev.values[f.key]))
    .map((f) => `${t(`equipment.field.${f.key}`)}: ${toText(prev.values[f.key]) || '–'} → ${toText(rev.values[f.key]) || '–'}`)
}
</script>

<template>
  <div class="screen">
    <ErrorText v-if="failed" :message="kind === 'bow' ? $t('equipment.couldNotLoadBow') : $t('equipment.couldNotLoadArrowSet')" />
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
      <AppButton @click="save">{{ uid === null ? (kind === 'bow' ? $t('equipment.addBowButton') : $t('equipment.addArrowSetButton')) : $t('common.save') }}</AppButton>
      <AppButton v-if="uid !== null" secondary @click="confirmDelete ? removeItem() : (confirmDelete = true)">
        {{ confirmDelete ? $t('equipment.tapAgainDelete') : $t('common.delete') }}
      </AppButton>
      <div v-if="revisions.length > 0" class="d-flex flex-column gap-2 mt-3">
        <h2 class="h6 m-0">{{ $t('equipment.history') }}</h2>
        <div v-for="(rev, i) in revisions" :key="rev.uid">
          <div class="fw-semibold">#{{ rev.number }}{{ rev.created_at ? ` · ${new Date(rev.created_at).toLocaleString()}` : '' }}</div>
          <div v-for="c in changes(rev, revisions[i + 1])" :key="c" class="muted">{{ c }}</div>
        </div>
      </div>
    </template>
  </div>
</template>
