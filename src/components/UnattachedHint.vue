<script setup lang="ts">
import { IonIcon } from '@ionic/vue'
import { playCircleOutline } from 'ionicons/icons'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'

import AppButton from '@/components/AppButton.vue'
import { useAuth } from '@/composables/useAuth'
import { useLog } from '@/composables/useLog'
import { useMedia } from '@/composables/useMedia'
import { useMoveMedia } from '@/composables/useMoveMedia'
import { useRemote } from '@/composables/useRemote'
import { loadThumbnail } from '@/lib/media-files'
import { isNear, nearWindow } from '@/lib/media-move'

// Photos and videos of the archer taken around the time of a session that are in no session yet, one tap to add them.
// `compact`: only the line, linking to the archer's page (for a screen that must not scroll).
const props = defineProps<{
  owner: number
  session: { id: string; started_at: string; ended_at?: string | null }
  compact?: boolean
  /** The training the session is linked to: its photos and videos show in the session already. */
  eventId?: string | null
  /** Query to open the archer's page with: the name shown there, for an archer other than yourself. */
  name?: string
}>()

const { api, userId, isLocal } = useAuth()
const media = useMedia()
const log = useLog()
const { move } = useMoveMedia()
const open = ref(false)
const busy = ref(false)
const failed = ref(false)

const queued = computed(() =>
  media.items.value.filter((i) => i.session === null && (i.owner ?? Number(userId.value)) === props.owner && isNear(i.taken_at, props.session) && (!props.eventId || i.event?.id !== props.eventId)),
)
const remote = useRemote(async () => {
  if (isLocal.value) return []
  const { from, to } = nearWindow(props.session)
  const query = { owner: props.owner, without_session: true, ...(props.eventId ? { not_in_event: props.eventId } : {}), taken_after: new Date(from).toISOString(), taken_before: new Date(to).toISOString() }
  return (await api.GET('/api/media/', { params: { query } })).data ?? null
})
watch(media.uploaded, remote.reload)

const previews = ref<Record<string, string>>({})
watch(
  queued,
  async (list) => {
    for (const item of list) {
      if (previews.value[item.id]) continue
      try {
        previews.value = { ...previews.value, [item.id]: URL.createObjectURL(await loadThumbnail(item.id)) }
      } catch {
        /* the file is gone; the upload will report it */
      }
    }
  },
  { immediate: true },
)
onBeforeUnmount(() => Object.values(previews.value).forEach((u) => URL.revokeObjectURL(u)))

type Entry = { id: string; queued: boolean; kind: 'photo' | 'video'; src: string }
const entries = computed<Entry[]>(() => [
  ...queued.value.map((q) => ({ id: q.id, queued: true, kind: q.kind, src: previews.value[q.id] ?? '' })),
  ...(remote.data.value ?? [])
    .filter((r) => r.can_edit && !queued.value.some((q) => q.id === r.id))
    .map((r) => ({ id: r.id, queued: false, kind: r.kind, src: r.thumbnail_url })),
])
// A clip the server has can not go into a session the server does not know yet.
const waits = computed(() => log.sessionWaiting(props.session.id))
const addable = (e: Entry) => e.queued || !waits.value

async function add(list: Entry[]) {
  busy.value = true
  failed.value = false
  const { failed: n } = await move(list.filter(addable), props.session.id)
  failed.value = n > 0
  busy.value = false
  remote.reload()
}
</script>

<template>
  <template v-if="entries.length > 0">
    <RouterLink v-if="compact" :to="{ path: '/media', query: { owner: String(owner), unattached: '1', ...(name ? { name } : {}) } }">
      {{ $t('media.nearby', { n: entries.length }, entries.length) }}
    </RouterLink>
    <div v-else class="d-flex flex-column gap-2">
      <a href="#" @click.prevent="open = !open">{{ $t('media.nearby', { n: entries.length }, entries.length) }}</a>
      <template v-if="open">
        <div class="d-flex flex-wrap gap-2">
          <div v-for="e in entries" :key="e.id" class="tile">
            <div class="thumb">
              <img v-if="e.src" :src="e.src" alt="" />
              <IonIcon v-if="e.kind === 'video'" :icon="playCircleOutline" class="play" />
            </div>
            <AppButton secondary :busy="busy || !addable(e)" @click="add([e])">{{ $t('media.addHere') }}</AppButton>
          </div>
        </div>
        <div v-if="waits && entries.some((e) => !e.queued)" class="muted">{{ $t('media.sessionWaiting') }}</div>
        <div v-if="failed" class="text-danger">{{ $t('media.moveFailed', { n: 1 }, 1) }}</div>
        <AppButton v-if="entries.length > 1" secondary :busy="busy" @click="add(entries)">{{ $t('media.addAll') }}</AppButton>
      </template>
    </div>
  </template>
</template>

<style scoped>
.tile {
  width: 31%;
}
.thumb {
  position: relative;
  aspect-ratio: 1;
  overflow: hidden;
  background: color-mix(in srgb, var(--ion-text-color, #000) 10%, transparent);
}
.thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.play {
  position: absolute;
  left: 4px;
  bottom: 4px;
  font-size: 26px;
  color: #fff;
  filter: drop-shadow(0 0 3px rgb(0 0 0 / 70%));
}
</style>
