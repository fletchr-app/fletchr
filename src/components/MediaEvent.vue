<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import EventChips from '@/components/EventChips.vue'
import { useAgenda } from '@/composables/useAgenda'
import { useAuth } from '@/composables/useAuth'
import type { components } from '@/lib/api-types'
import { eventTitle, type EventLink } from '@/lib/schedule'

type Clip = components['schemas']['Media']

// The team training a photo or clip is from: shown, and changeable by whoever may change the clip. Its notes follow (the server moves them).
const props = defineProps<{ clip: Clip }>()
const emit = defineEmits<{ changed: [] }>()
const { t } = useI18n()
const { api } = useAuth()
const { suggest, load } = useAgenda()
const changing = ref(false)
const error = ref<string | null>(null)
onMounted(() => void load())

const linked = computed<EventLink | null>(() => {
  const info = props.clip.event_info
  return props.clip.event && info ? { id: props.clip.event, name: info.name, kind: info.kind as EventLink['kind'], start: info.start, team_name: info.team_name } : null
})
const title = computed(() => {
  if (!linked.value) return ''
  const name = eventTitle(linked.value)
  return name.startsWith('event.kind.') ? t(name) : name
})
const suggestions = computed(() => suggest(props.clip.taken_at))

async function choose(link: EventLink | null | undefined) {
  if (link === undefined) return
  error.value = null
  const form = new FormData()
  form.append('event', link?.id ?? '')
  if (link?.slot && link.date) {
    form.append('event_slot', link.slot)
    form.append('event_date', link.date)
  }
  try {
    const { response } = await api.PUT('/api/media/{media_id}/', { params: { path: { media_id: props.clip.id } }, body: {}, bodySerializer: () => form })
    if (!response.ok) return void (error.value = t('event.changeFailed'))
  } catch {
    return void (error.value = t('common.serverNotReachable'))
  }
  changing.value = false
  emit('changed')
}
</script>

<template>
  <div v-if="linked || (clip.can_edit && suggestions.length > 0)" class="px-3">
    <div v-if="linked" class="d-flex flex-wrap gap-3 align-items-baseline">
      <span class="muted">{{ $t('event.linked', { name: title, date: new Date(linked.start!).toLocaleDateString() }) }}</span>
      <template v-if="clip.can_edit">
        <a href="#" @click.prevent="changing = !changing">{{ $t('event.change') }}</a>
        <a href="#" @click.prevent="choose(null)">{{ $t('event.unlink') }}</a>
      </template>
    </div>
    <a v-else-if="!changing" href="#" @click.prevent="changing = true">{{ $t('event.link') }}</a>
    <EventChips v-if="changing" :model-value="linked ?? undefined" :suggestions="suggestions" class="mt-2" @update:model-value="choose" />
    <div v-if="error" class="text-danger">{{ error }}</div>
  </div>
</template>
