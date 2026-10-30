<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import EventChips from '@/components/EventChips.vue'
import { useAgenda } from '@/composables/useAgenda'
import { useLog } from '@/composables/useLog'
import type { LogSession } from '@/lib/log-model'
import { eventTitle } from '@/lib/schedule'

// The team training a session on this device is linked to: shown, and for the owner changeable. Nothing is linked by time alone.
const props = defineProps<{ session: LogSession }>()
const { t } = useI18n()
const { setEvent } = useLog()
const { suggest, load } = useAgenda()
const changing = ref(false)

onMounted(() => void load())
const suggestions = computed(() => suggest(props.session.started_at, props.session.ended_at, { preferKind: props.session.type === 'competition' ? 'competition' : undefined }))
const title = computed(() => {
  const link = props.session.event
  if (!link) return ''
  const name = eventTitle(link)
  return name.startsWith('event.kind.') ? t(name) : name
})
const chosen = computed({
  get: () => props.session.event,
  set: (link) => {
    setEvent(props.session.id, link ?? null)
    changing.value = false
  },
})
</script>

<template>
  <div v-if="session.event || suggestions.length > 0">
    <div v-if="session.event" class="d-flex flex-wrap gap-3 align-items-baseline">
      <span>{{ $t('event.linked', { name: title, date: session.event.start ? new Date(session.event.start).toLocaleDateString() : '' }) }}</span>
      <a href="#" @click.prevent="changing = !changing">{{ $t('event.change') }}</a>
      <a href="#" @click.prevent="setEvent(session.id, null)">{{ $t('event.unlink') }}</a>
    </div>
    <a v-else-if="!changing" href="#" @click.prevent="changing = true">{{ $t('event.link') }}</a>
    <EventChips v-if="changing" v-model="chosen" :suggestions="suggestions" class="mt-2" />
  </div>
</template>
