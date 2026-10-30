<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import ChipGroup from '@/components/ChipGroup.vue'
import { type AgendaItem, eventTitle, type EventLink, linkOf } from '@/lib/schedule'

// The trainings to choose from for a session, note or photo, and "None". `undefined` is not chosen yet (no chip is
// selected), `null` is "None" (which takes a link out).
const props = defineProps<{ suggestions: AgendaItem[]; label?: string }>()
const model = defineModel<EventLink | null | undefined>({ required: true })
const { t } = useI18n()

// The current link stays in the list even when nothing suggests it any more, so it can be seen and kept.
const links = computed<EventLink[]>(() => {
  const list = props.suggestions.map(linkOf)
  return model.value && !list.some((l) => l.id === model.value!.id) ? [model.value, ...list] : list
})
const manyTeams = computed(() => new Set(links.value.map((l) => l.team_name)).size > 1)

function chipLabel(link: EventLink) {
  const title = eventTitle(link)
  const name = title.startsWith('event.kind.') ? t(title) : title
  const time = link.start ? new Date(link.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''
  return [name, time, manyTeams.value ? link.team_name : ''].filter(Boolean).join(' · ')
}

const NONE = ''
const UNSET = '?'
const options = computed(() => [...links.value.map((l) => ({ value: l.id, label: chipLabel(l) })), { value: NONE, label: t('event.none') }])
const chosen = computed({
  get: () => (model.value === undefined ? UNSET : model.value === null ? NONE : model.value.id),
  set: (value) => (model.value = value === NONE ? null : links.value.find((l) => l.id === value)),
})
</script>

<template>
  <ChipGroup v-model="chosen" :label="label ?? $t('event.suggest')" :options="options" />
</template>
