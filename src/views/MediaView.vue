<script setup lang="ts">
import {
  actionSheetController,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonModal,
  IonSpinner,
  IonTitle,
  IonToolbar,
  onIonViewWillEnter,
} from '@ionic/vue'
import { closeCircle, cloudUploadOutline, playCircleOutline } from 'ionicons/icons'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'

import AppButton from '@/components/AppButton.vue'
import AppPage from '@/components/AppPage.vue'
import ErrorText from '@/components/ErrorText.vue'
import SyncBanner from '@/components/SyncBanner.vue'
import { useAuth } from '@/composables/useAuth'
import { useMedia } from '@/composables/useMedia'
import { useRemote } from '@/composables/useRemote'
import { useUploadSettings } from '@/composables/useUploadSettings'
import type { components } from '@/lib/api-types'
import { prepareImage } from '@/lib/image'
import { fromBase64, loadFiles, loadThumbnail, removeFiles, saveThumbnail } from '@/lib/media-files'
import type { QueuedMedia } from '@/lib/media-queue'
import { canRecordVideo, type Picked, pickMedia, type PickSource } from '@/lib/pick-media'
import { type ConvertErrorCode, VideoConverter } from '@/lib/video-converter'
import { planConversion, VIDEO_LIMITS } from '@/lib/video-plan'
import { newId } from '@/lib/uuid'

type Remote = components['schemas']['Media']
/** Something being prepared on the phone: a photo shrunk and saved, a video converted. A failed one stays, with its error. */
type Preparing = { key: string; kind: 'photo' | 'video'; src: string; percent?: number; error?: string }
type Shown = { key: string; src: string; kind: 'photo' | 'video'; queued?: QueuedMedia; remote?: Remote; preparing?: Preparing }

// The photos and videos of one session, or of one archer. Everyone can add to their own sessions, and a coach to
// those of their archers: that shows as ?owner=. What is added waits on the phone until it is uploaded.
const { t } = useI18n()
const route = useRoute()
const sessionId = (route.query.session as string | undefined) ?? null
const ownerParam = route.query.owner ? Number(route.query.owner) : null
const name = route.query.name as string | undefined
const title = name ? t('media.titleFor', { name }) : t('media.title')

const { api, userId } = useAuth()
const media = useMedia()
const { videosWifiOnly } = useUploadSettings()
const me = computed(() => Number(userId.value))
const owner = computed(() => ownerParam ?? me.value)

const { data, error, loading, reload } = useRemote(async () => {
  const query = sessionId ? { session: sessionId } : { owner: owner.value }
  const { data: list, response } = await api.GET('/api/media/', { params: { query } })
  return response.status === 400 ? [] : (list ?? null) // 400: the session has not reached the server yet
})

let firstVisit = true
onIonViewWillEnter(() => (firstVisit ? (firstVisit = false) : reload()))
watch(media.uploaded, reload)

// Previews of what is still on the phone.
const queued = computed(() => media.items.value.filter((i) => (sessionId ? i.session === sessionId : (i.owner ?? me.value) === owner.value)))
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

const preparing = ref<Preparing[]>([])
onBeforeUnmount(() => {
  Object.values(previews.value).forEach((u) => URL.revokeObjectURL(u))
  preparing.value.forEach((p) => p.src.startsWith('blob:') && URL.revokeObjectURL(p.src))
})

// Queued first, then what is being prepared (where it will be once it is queued), then what the server has.
const shown = computed<Shown[]>(() => [
  ...queued.value.map((q) => ({ key: q.id, src: previews.value[q.id] ?? '', kind: q.kind, queued: q })),
  ...preparing.value.map((p) => ({ key: p.key, src: p.src, kind: p.kind, preparing: p })),
  ...(data.value ?? []).filter((r) => !queued.value.some((q) => q.id === r.id)).map((r) => ({ key: r.id, src: r.thumbnail_url, kind: r.kind, remote: r })),
])
const videoWaits = computed(() => media.items.value.some((i) => i.kind === 'video') && videosWifiOnly.value)

function tileOf(key: string) {
  return preparing.value.find((p) => p.key === key)
}
function stopPreparing(key: string) {
  const tile = tileOf(key)
  if (tile?.src.startsWith('blob:')) URL.revokeObjectURL(tile.src)
  preparing.value = preparing.value.filter((p) => p.key !== key)
}

const adding = ref(false)
const addError = ref<string | null>(null)

async function chooseSource() {
  const buttons: { text: string; role?: string; handler?: () => void }[] = [
    { text: t('media.takePhoto'), handler: () => void add('photo') },
    ...(canRecordVideo() ? [{ text: t('media.recordVideo'), handler: () => void add('video') }] : []),
    { text: t('media.fromGallery'), handler: () => void add('gallery') },
    { text: t('common.cancel'), role: 'cancel' },
  ]
  const sheet = await actionSheetController.create({ header: t('media.pickHeader'), subHeader: canRecordVideo() ? t('media.slowMotionHint') : undefined, buttons })
  await sheet.present()
}

async function add(source: PickSource) {
  adding.value = true
  addError.value = null
  let picked: Picked | null
  try {
    picked = await pickMedia(source)
  } catch {
    addError.value = t('media.couldNotAdd')
    return
  } finally {
    adding.value = false // the next one can be picked while this one is prepared
  }
  if (!picked) return
  const key = `preparing-${newId()}`
  try {
    if (picked.kind === 'photo') await addPhoto(key, picked)
    else await addVideo(key, picked)
  } catch (e) {
    const tile = tileOf(key)
    if (tile) tile.error = (e as { friendly?: string }).friendly ?? t('media.couldNotAdd')
    else addError.value = t('media.couldNotAdd')
  }
}

function where() {
  return { owner: owner.value === me.value ? null : owner.value, session: sessionId }
}

async function addPhoto(key: string, picked: Extract<Picked, { kind: 'photo' }>) {
  preparing.value = [...preparing.value, { key, kind: 'photo', src: URL.createObjectURL(picked.blob) }]
  const { file, thumbnail, width, height } = await prepareImage(picked.blob)
  const id = await media.enqueue({ kind: 'photo', ...where(), taken_at: picked.takenAt ?? new Date().toISOString(), width, height }, { file, thumbnail })
  previews.value = { ...previews.value, [id]: URL.createObjectURL(thumbnail) } // so the tile does not blink when it changes
  stopPreparing(key)
}

/** A refusal the person should read: what is wrong, in plain words. */
const friendly = (message: string) => Object.assign(new Error(message), { friendly: message })

async function addVideo(key: string, picked: Extract<Picked, { kind: 'video' }>) {
  const info = await VideoConverter.inspect({ uri: picked.uri }).catch(() => {
    throw friendly(t('media.unreadable'))
  })
  // The first frame stands in for the clip while it is converted.
  const frame = info.thumbnail ? fromBase64(info.thumbnail, 'image/jpeg') : null
  preparing.value = [...preparing.value, { key, kind: 'video', src: frame ? URL.createObjectURL(frame) : '', percent: 0 }]
  const plan = planConversion(info)
  if (!plan.ok) {
    throw friendly(plan.reason === 'tooLong' ? t('media.tooLong', { seconds: Math.round(plan.seconds), max: plan.maxSeconds }) : t('media.unreadable'))
  }
  const id = newId()
  const progress = await VideoConverter.addListener('progress', ({ percent }) => {
    const tile = tileOf(key)
    if (tile) tile.percent = Math.round(percent)
  })
  try {
    const result = await VideoConverter.convert({ uri: picked.uri, id, height: plan.height, bitrate: plan.bitrate, speed: plan.speed, keyframeSeconds: plan.keyframeSeconds })
    if (result.bytes > VIDEO_LIMITS.maxBytes) {
      await removeFiles(id)
      throw friendly(t('media.tooLarge', { max: VIDEO_LIMITS.maxBytes / 1024 / 1024 }))
    }
    if (frame) await saveThumbnail(id, frame)
    media.enqueueStored({
      id,
      kind: 'video',
      ...where(),
      taken_at: picked.takenAt ?? new Date().toISOString(),
      width: plan.width,
      height: plan.height,
      duration_ms: Math.round(result.durationMs || plan.realDurationMs),
      capture_fps: Math.round(plan.fps * 100) / 100,
      frame_count: result.frames || undefined,
    })
    if (frame) previews.value = { ...previews.value, [id]: URL.createObjectURL(frame) }
    stopPreparing(key)
  } catch (e) {
    if ((e as { code?: ConvertErrorCode }).code === 'cancelled') return stopPreparing(key)
    if ((e as { friendly?: string }).friendly) throw e
    const code = (e as { code?: ConvertErrorCode }).code
    throw friendly(code === 'busy' ? t('media.busy') : t('media.conversionFailed'))
  } finally {
    void progress.remove()
  }
}

function cancelConversion(tile: Preparing) {
  void VideoConverter.cancel().catch(() => stopPreparing(tile.key))
}

// The big picture, or the clip.
const viewing = ref<Shown | null>(null)
const bigSrc = ref('')
const confirmDelete = ref(false)
const deleteError = ref<string | null>(null)
let bigUrl: string | null = null
async function open(item: Shown) {
  if (item.preparing && !item.preparing.error) return // still working
  viewing.value = item
  confirmDelete.value = false
  deleteError.value = null
  bigSrc.value = item.remote?.file_url ?? item.src
  if (item.queued && item.kind === 'photo') {
    try {
      bigUrl = URL.createObjectURL((await loadFiles(item.queued.id, 'image/jpeg')).file)
      bigSrc.value = bigUrl
    } catch {
      /* the preview stays */
    }
  }
}
function close() {
  viewing.value = null
  if (bigUrl) URL.revokeObjectURL(bigUrl)
  bigUrl = null
}
const canDelete = computed(() => !!viewing.value && (!!viewing.value.queued || !!viewing.value.preparing || viewing.value.remote?.can_edit === true))
async function remove() {
  const item = viewing.value!
  if (!confirmDelete.value) return (confirmDelete.value = true)
  if (item.preparing) {
    const keep = item.preparing.src
    preparing.value = preparing.value.filter((p) => p.key !== item.preparing!.key)
    setTimeout(() => keep.startsWith('blob:') && URL.revokeObjectURL(keep), 500) // the modal still shows it while it closes
  } else if (item.queued) media.remove(item.queued.id)
  else {
    const { response } = await api.DELETE('/api/media/{media_id}/', { params: { path: { media_id: item.remote!.id } } }).catch(() => ({ response: null }))
    if (!response || !(response.ok || response.status === 404)) return (deleteError.value = t('common.nothingDeleted'))
    reload()
  }
  close()
}
const taken = (item: Shown | null) => {
  const when = item?.remote?.taken_at ?? item?.queued?.taken_at
  return when ? new Date(when).toLocaleString() : ''
}
</script>

<template>
  <AppPage :title="title">
    <div class="screen">
      <AppButton :busy="adding" @click="chooseSource">{{ $t('media.add') }}</AppButton>
      <ErrorText :message="addError" />
      <SyncBanner />
      <div v-if="videoWaits && media.waitingForWifi() > 0" class="muted">{{ $t('media.videosWaitForWifi') }}</div>
      <ErrorText :message="error" />
      <div v-if="loading && shown.length === 0">{{ $t('common.loading') }}</div>
      <div v-else-if="shown.length === 0 && !error">{{ $t('media.empty') }}</div>
      <div class="grid">
        <button v-for="item in shown" :key="item.key" type="button" class="cell" @click="open(item)">
          <img v-if="item.src" :src="item.src" alt="" />
          <IonIcon v-if="item.kind === 'video' && !item.preparing" :icon="playCircleOutline" class="play" />
          <IonIcon v-if="item.queued && !item.queued.error" :icon="cloudUploadOutline" class="badge" :title="$t('media.waiting')" />
          <span v-if="item.queued?.error || item.preparing?.error" class="badge text-danger">!</span>
          <span v-if="item.preparing && !item.preparing.error" class="veil" :title="$t('media.preparing')">
            <IonSpinner name="crescent" />
            <span v-if="item.preparing.percent !== undefined" class="percent">{{ item.preparing.percent }} %</span>
          </span>
          <IonIcon
            v-if="item.preparing && item.kind === 'video' && !item.preparing.error"
            :icon="closeCircle"
            class="cancel"
            :title="$t('media.cancelConversion')"
            @click.stop="cancelConversion(item.preparing)"
          />
        </button>
      </div>
    </div>
    <IonModal :is-open="viewing !== null" @did-dismiss="close">
      <IonHeader>
        <IonToolbar>
          <IonTitle>{{ taken(viewing) }}</IonTitle>
          <IonButtons slot="end"><IonButton @click="close">{{ $t('media.close') }}</IonButton></IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent>
        <div class="screen">
          <video v-if="viewing?.remote?.kind === 'video'" :src="bigSrc" :poster="viewing.src" class="big" controls playsinline></video>
          <img v-else :src="bigSrc" alt="" class="big" />
          <div v-if="viewing?.remote && viewing.remote.uploaded_by !== viewing.remote.owner" class="muted">{{ $t('media.addedBy', { name: viewing.remote.owner_name }) }}</div>
          <div v-if="viewing?.queued?.error || viewing?.preparing?.error" class="text-danger">{{ viewing.queued?.error ?? viewing.preparing?.error }}</div>
          <ErrorText :message="deleteError" />
          <AppButton v-if="canDelete" secondary @click="remove">{{ confirmDelete ? $t('media.deleteConfirm') : $t('media.delete') }}</AppButton>
        </div>
      </IonContent>
    </IonModal>
  </AppPage>
</template>

<style scoped>
.grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
}
.cell {
  position: relative;
  padding: 0;
  border: 0;
  background: var(--ion-color-step-100, #eee);
  aspect-ratio: 1;
  overflow: hidden;
}
.cell img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.veil {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: center;
  justify-content: center;
  background: rgb(0 0 0 / 40%);
  color: #fff;
}
.percent {
  font-weight: 600;
}
.badge {
  position: absolute;
  right: 4px;
  bottom: 4px;
  padding: 2px 4px;
  border-radius: 8px;
  background: rgb(0 0 0 / 55%);
  color: #fff;
  font-weight: 600;
}
.play {
  position: absolute;
  left: 4px;
  bottom: 4px;
  font-size: 26px;
  color: #fff;
  filter: drop-shadow(0 0 3px rgb(0 0 0 / 70%));
}
.cancel {
  position: absolute;
  top: 2px;
  right: 2px;
  font-size: 26px;
  color: #fff;
  filter: drop-shadow(0 0 3px rgb(0 0 0 / 70%));
}
.big {
  width: 100%;
  max-height: 70vh;
  object-fit: contain;
}
</style>
