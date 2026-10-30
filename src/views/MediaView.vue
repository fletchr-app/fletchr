<script setup lang="ts">
import {
  actionSheetController,
  IonButton,
  IonButtons,
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonModal,
  IonSpinner,
  IonTitle,
  IonToolbar,
  onIonViewWillEnter,
} from '@ionic/vue'
import { checkmarkCircle, closeCircle, cloudUploadOutline, playCircleOutline } from 'ionicons/icons'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import AppButton from '@/components/AppButton.vue'
import AppPage from '@/components/AppPage.vue'
import DrawnPicture from '@/components/DrawnPicture.vue'
import ChipGroup from '@/components/ChipGroup.vue'
import ErrorText from '@/components/ErrorText.vue'
import SessionPicker from '@/components/SessionPicker.vue'
import SyncBanner from '@/components/SyncBanner.vue'
import { useAuth } from '@/composables/useAuth'
import { useLog } from '@/composables/useLog'
import { useMedia } from '@/composables/useMedia'
import { type MoveItem, useMoveMedia } from '@/composables/useMoveMedia'
import { useRemote } from '@/composables/useRemote'
import { useUploadSettings } from '@/composables/useUploadSettings'
import type { components } from '@/lib/api-types'
import { fitted, type Shape } from '@/lib/drawing'
import { prepareImage } from '@/lib/image'
import { drawnShapes } from '@/lib/media-notes'
import { byDay, dayTitle } from '@/lib/media-days'
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
const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const sessionId = (route.query.session as string | undefined) ?? null
const ownerParam = route.query.owner ? Number(route.query.owner) : null
const name = route.query.name as string | undefined
const title = name ? t('media.titleFor', { name }) : t('media.title')

const { api, userId } = useAuth()
const media = useMedia()
const { renamed } = useLog()
// The server merged this session into another one: continue there.
watch(
  () => (sessionId ? renamed.value[sessionId] : undefined),
  (to) => to && void router.replace({ path: '/media', query: { ...route.query, session: to } }),
)
const { videosWifiOnly } = useUploadSettings()
const me = computed(() => Number(userId.value))
const owner = computed(() => ownerParam ?? me.value)

// An archer's page can be limited to what is in no session.
const picking = !!route.query.pick
const filter = ref<'all' | 'none'>(route.query.unattached ? 'none' : 'all')
const unattachedOnly = computed(() => !sessionId && filter.value === 'none')
const filters = computed(() => [
  { value: 'all' as const, label: t('media.all') },
  { value: 'none' as const, label: t('media.notInSession') },
])

const { data, error, loading, reload } = useRemote(
  async () => {
    const query = sessionId ? { session: sessionId } : { owner: owner.value, ...(unattachedOnly.value ? { without_session: true } : {}) }
    const { data: list, response } = await api.GET('/api/media/', { params: { query } })
    return response.status === 400 ? [] : (list ?? null) // 400: the session has not reached the server yet
  },
  { watch: [filter] },
)

// Video of an archer under 18 needs the consent of the parents on record. Unknown (offline) counts as allowed: the server decides.
const consent = useRemote(async () => {
  if (ownerParam && ownerParam !== me.value) return (await api.GET('/api/archers/{user_id}/', { params: { path: { user_id: ownerParam } } })).data?.video_allowed ?? null
  return (await api.GET('/api/me/')).data?.profile.video_allowed ?? null
})
const videoAllowed = computed(() => consent.data.value !== false)

let firstVisit = true
onIonViewWillEnter(() => {
  if (firstVisit) return void (firstVisit = false)
  reload()
  consent.reload()
  reopen()
})
watch(media.uploaded, reload)

// Previews of what is still on the phone.
const queued = computed(() =>
  media.items.value.filter((i) => (sessionId ? i.session === sessionId : (i.owner ?? me.value) === owner.value && (!unattachedOnly.value || i.session === null))),
)
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
  Object.values(full.value).forEach((u) => URL.revokeObjectURL(u))
  Object.values(previews.value).forEach((u) => URL.revokeObjectURL(u))
  preparing.value.forEach((p) => p.src.startsWith('blob:') && URL.revokeObjectURL(p.src))
})

// Queued first, then what is being prepared (where it will be once it is queued), then what the server has.
const shown = computed<Shown[]>(() => [
  ...queued.value.map((q) => ({ key: q.id, src: previews.value[q.id] ?? '', kind: q.kind, queued: q })),
  ...preparing.value.map((p) => ({ key: p.key, src: p.src, kind: p.kind, preparing: p })),
  ...(data.value ?? []).filter((r) => !queued.value.some((q) => q.id === r.id)).map((r) => ({ key: r.id, src: r.thumbnail_url, kind: r.kind, remote: r })),
])
// What is on the phone comes first without a heading, what the server has follows by day.
const waiting = computed(() => shown.value.filter((i) => !i.remote))
const days = computed(() => byDay(shown.value.filter((i) => i.remote).map((i) => ({ ...i, taken_at: i.remote!.taken_at }))))
const sections = computed(() => [
  ...(waiting.value.length > 0 ? [{ key: 'waiting', title: '', items: waiting.value }] : []),
  ...days.value.map((d) => ({ key: d.day, title: dayTitle(d.day, locale.value), items: d.items as unknown as Shown[] })),
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
    ...(canRecordVideo() && videoAllowed.value ? [{ text: t('media.recordVideo'), handler: () => void add('video') }] : []),
    { text: t('media.fromGallery'), handler: () => void add('gallery') },
    { text: t('common.cancel'), role: 'cancel' },
  ]
  const sheet = await actionSheetController.create({ header: t('media.pickHeader'), buttons })
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
  if (picked.kind === 'video' && !videoAllowed.value) {
    addError.value = t('media.needsConsent')
    return
  }
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

// The photos full screen: swipe to the next. A clip opens in the player instead.
const photos = computed(() => shown.value.filter((i) => i.kind === 'photo' && !(i.preparing && !i.preparing.error)))
const viewKey = ref<string | null>(null)
const viewing = computed(() => photos.value.find((p) => p.key === viewKey.value) ?? null)
const strip = ref<HTMLElement | null>(null)
const full = ref<Record<string, string>>({}) // the photos that wait on the phone, in full size
const confirmDelete = ref(false)
const deleteError = ref<string | null>(null)

async function loadFull(item: Shown) {
  if (!item.queued || full.value[item.key]) return
  try {
    full.value = { ...full.value, [item.key]: URL.createObjectURL((await loadFiles(item.queued.id, 'image/jpeg')).file) }
  } catch {
    /* the preview stays */
  }
}
function open(item: Shown) {
  if (item.preparing && !item.preparing.error) return // still working
  if (item.remote?.kind === 'video') {
    // The player page knows which clips are next to this one by the same query as this page.
    const query = { ...(sessionId ? { session: sessionId } : { owner: String(owner.value) }), ...(route.query.pick ? { pick: route.query.pick as string } : {}) }
    return void router.push({ path: `/media/${item.remote.id}`, query })
  }
  viewKey.value = item.key
  confirmDelete.value = false
  deleteError.value = null
  void loadFull(item)
}
/** Once the modal is there, the strip starts at the photo that was tapped. */
function placeStrip() {
  const at = photos.value.findIndex((p) => p.key === viewKey.value)
  strip.value?.scrollTo({ left: Math.max(0, at) * strip.value.clientWidth })
}
function swiped() {
  const el = strip.value
  const item = el && photos.value[Math.round(el.scrollLeft / el.clientWidth)]
  if (!item || item.key === viewKey.value) return
  viewKey.value = item.key
  confirmDelete.value = false
  deleteError.value = null
  void loadFull(item)
}
// The coach's notes and drawings, for the photos swiped to while the modal is open. Not polled.
type MediaNotes = components['schemas']['Note'][]
const photoNotes = ref<Record<string, MediaNotes>>({})
const writable = ref<Record<number, boolean>>({}) // per archer: may I write notes about them
async function loadNotes(item: Shown) {
  const remote = item.remote
  if (!remote) return
  try {
    if (photoNotes.value[remote.id] === undefined) {
      const { data: list } = await api.GET('/api/notes/', { params: { query: { media: remote.id } } })
      if (list) photoNotes.value = { ...photoNotes.value, [remote.id]: list }
    }
    if (writable.value[remote.owner] === undefined) {
      const { data: teams } = await api.GET('/api/notes/teams/', { params: { query: { archer: remote.owner } } })
      if (teams) writable.value = { ...writable.value, [remote.owner]: teams.length > 0 || remote.owner === Number(userId.value) }
    }
  } catch {
    /* no drawings and no Notes button; the photo is still there */
  }
}
const shapesOf = (item: Shown): Shape[] => (item.remote ? drawnShapes(photoNotes.value[item.remote.id] ?? []) : [])
const notesButton = computed(() => {
  const remote = viewing.value?.remote
  if (!remote) return false
  return (photoNotes.value[remote.id]?.length ?? 0) > 0 || writable.value[remote.owner] === true
})
const notesCount = computed(() => photoNotes.value[viewing.value?.remote?.id ?? '']?.length ?? 0)
// Each slide is as large as the strip; a photo with a drawing is sized to fit, the drawing lies over exactly the photo.
const stripBox = ref({ width: 0, height: 0 })
let stripWatch: ResizeObserver | null = null
watch(strip, (el) => {
  stripWatch?.disconnect()
  if (!el) return
  const measure = () => (stripBox.value = { width: el.clientWidth, height: el.clientHeight })
  measure()
  stripWatch = new ResizeObserver(measure)
  stripWatch.observe(el)
})
onBeforeUnmount(() => stripWatch?.disconnect())
function fit(remote: Remote) {
  const box = fitted(stripBox.value, remote.width / remote.height)
  return { width: `${box.width}px`, height: `${box.height}px` }
}
watch(viewing, (item) => item && void loadNotes(item))

// "Notes" opens the photo in the player, where the notes and the pencil are. Back lands on the same photo here again.
let comeBackTo: string | null = null
function openNotes() {
  const remote = viewing.value!.remote!
  comeBackTo = viewKey.value
  const query = sessionId ? { session: sessionId } : { owner: String(owner.value) }
  close()
  void router.push({ path: `/media/${remote.id}`, query })
}
function reopen() {
  const item = comeBackTo && photos.value.find((p) => p.key === comeBackTo)
  comeBackTo = null
  photoNotes.value = {} // what was drawn in the player is new
  if (item) open(item)
}
function close() {
  viewKey.value = null
  Object.values(full.value).forEach((u) => URL.revokeObjectURL(u))
  full.value = {}
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

// Moving into a session, one photo from its full-screen view or several selected in the grid.
const { move } = useMoveMedia()
const selecting = ref(false)
const selected = ref<ReadonlySet<string>>(new Set())
const pickerItems = ref<Shown[] | null>(null)
const moveMessage = ref<{ text: string; failed: boolean } | null>(null)
const canMove = (item: Shown) => !picking && !item.preparing && (!!item.queued || item.remote?.can_edit === true)
const sessionOf = (item: Shown) => (item.queued ? item.queued.session : (item.remote?.session ?? null))
const takenOf = (item: Shown) => (item.queued?.taken_at ?? item.remote?.taken_at)!
const selectedItems = computed(() => shown.value.filter((i) => selected.value.has(i.key) && canMove(i)))
const canMoveViewing = computed(() => !!viewing.value && canMove(viewing.value))
function endSelecting() {
  selecting.value = false
  selected.value = new Set()
}
function toggle(item: Shown) {
  if (!canMove(item)) return
  const next = new Set(selected.value)
  if (!next.delete(item.key)) next.add(item.key)
  selected.value = next
}
function tap(item: Shown) {
  if (selecting.value) toggle(item)
  else open(item)
}
const pickerOwner = computed(() => {
  const first = pickerItems.value?.[0]
  return first?.remote?.owner ?? first?.queued?.owner ?? me.value
})
const pickerTakenAt = computed(() => (pickerItems.value ?? []).map(takenOf).sort()[0] ?? new Date().toISOString())
const pickerCurrent = computed(() => {
  const sessions = new Set((pickerItems.value ?? []).map(sessionOf))
  return sessions.size === 1 ? ([...sessions][0] ?? null) : null
})
const pickerRemovable = computed(() => (pickerItems.value ?? []).some((i) => sessionOf(i) !== null))
async function moveTo(session: string | null) {
  const items = pickerItems.value ?? []
  pickerItems.value = null
  const { moved, failed } = await move(items.map((i): MoveItem => ({ id: i.queued?.id ?? i.remote!.id, queued: !!i.queued })), session)
  moveMessage.value = failed > 0 ? { text: t('media.moveFailed', { n: failed }, failed), failed: true } : { text: t('media.moved', { n: moved }, moved), failed: false }
  close()
  endSelecting()
  reload()
}
function removeSelected() {
  pickerItems.value = selectedItems.value
  void moveTo(null)
}
</script>

<template>
  <AppPage :title="title">
    <div class="screen">
      <AppButton :busy="adding" @click="chooseSource">{{ $t('media.add') }}</AppButton>
      <AppButton v-if="!picking && shown.some(canMove)" secondary @click="selecting ? endSelecting() : (selecting = true)">{{ selecting ? $t('common.cancel') : $t('media.select') }}</AppButton>
      <div v-if="selecting" class="d-flex flex-column gap-2">
        <div class="muted">{{ $t('media.selected', { n: selectedItems.length }, selectedItems.length) }}</div>
        <AppButton :busy="selectedItems.length === 0" @click="pickerItems = selectedItems">{{ $t('media.moveToSession') }}</AppButton>
        <AppButton v-if="sessionId" secondary :busy="selectedItems.length === 0" @click="removeSelected">{{ $t('media.removeFromSession') }}</AppButton>
      </div>
      <ChipGroup v-if="!sessionId && !picking" v-model="filter" :options="filters" />
      <div v-if="moveMessage" :class="moveMessage.failed ? 'text-danger' : 'muted'">{{ moveMessage.text }}</div>
      <div v-if="!videoAllowed" class="muted">{{ $t('media.needsConsent') }}</div>
      <div v-else-if="canRecordVideo()" class="faint">{{ $t('media.slowMotionHint') }}</div>
      <ErrorText :message="addError" />
      <SyncBanner />
      <div v-if="videoWaits && media.waitingForWifi() > 0" class="muted">{{ $t('media.videosWaitForWifi') }}</div>
      <ErrorText :message="error" />
      <div v-if="loading && shown.length === 0">{{ $t('common.loading') }}</div>
      <div v-else-if="shown.length === 0 && !error">{{ $t('media.empty') }}</div>
      <template v-for="section in sections" :key="section.key">
        <h3 v-if="section.title" class="day">{{ section.title }}</h3>
        <div class="grid">
        <button v-for="item in section.items" :key="item.key" type="button" class="cell" :class="{ chosen: selected.has(item.key) }" @click="tap(item)">
            <img v-if="item.src" :src="item.src" alt="" />
            <IonIcon v-if="selecting && selected.has(item.key)" :icon="checkmarkCircle" class="check" />
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
      </template>
    </div>
    <SessionPicker
      v-if="pickerItems"
      open
      :owner="pickerOwner"
      :taken-at="pickerTakenAt"
      :current="pickerCurrent"
      :server-items="pickerItems.some((i) => !!i.remote)"
      :removable="pickerRemovable"
      @close="pickerItems = null"
      @pick="moveTo"
    />
    <IonModal :is-open="viewing !== null" class="viewer" @did-present="placeStrip" @did-dismiss="close">
      <IonHeader>
        <IonToolbar>
          <IonTitle>{{ taken(viewing) }}</IonTitle>
          <IonButtons slot="end"><IonButton @click="close">{{ $t('media.close') }}</IonButton></IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent :scroll-y="false">
        <div ref="strip" class="strip" @scroll.passive="swiped">
          <div v-for="p in photos" :key="p.key" class="slide">
            <DrawnPicture v-if="p.remote && shapesOf(p).length > 0" :src="full[p.key] ?? p.remote.file_url" :width="p.remote.width" :height="p.remote.height" :shapes="shapesOf(p)" :style="fit(p.remote)" />
            <img v-else :src="full[p.key] ?? p.remote?.file_url ?? p.src" alt="" loading="lazy" />
          </div>
        </div>
      </IonContent>
      <IonFooter v-if="viewing">
        <div class="screen">
          <div v-if="viewing.remote && viewing.remote.uploaded_by !== viewing.remote.owner" class="muted">{{ $t('media.addedBy', { name: viewing.remote.uploaded_by_name }) }}</div>
          <div v-if="viewing.queued?.error || viewing.preparing?.error" class="text-danger">{{ viewing.queued?.error ?? viewing.preparing?.error }}</div>
          <ErrorText :message="deleteError" />
          <AppButton v-if="notesButton" secondary @click="openNotes">{{ $t('media.openNotes') }}{{ notesCount > 0 ? ` (${notesCount})` : '' }}</AppButton>
          <AppButton v-if="canMoveViewing" secondary @click="pickerItems = [viewing!]">{{ viewing && sessionOf(viewing) ? $t('media.moveToOtherSession') : $t('media.moveToSession') }}</AppButton>
          <AppButton v-if="canDelete" secondary @click="remove">{{ confirmDelete ? (notesCount > 0 ? $t('media.deleteConfirmNotes') : $t('media.deleteConfirm')) : $t('media.delete') }}</AppButton>
        </div>
      </IonFooter>
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
  background: color-mix(in srgb, var(--ion-text-color, #000) 10%, transparent);
  aspect-ratio: 1;
  overflow: hidden;
}
.cell img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.chosen img {
  opacity: 0.55;
}
.check {
  position: absolute;
  top: 4px;
  right: 4px;
  font-size: 26px;
  color: var(--ion-color-primary);
  background: #fff;
  border-radius: 50%;
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
.day {
  margin: 12px 0 0;
  font-size: 1rem;
  font-weight: 600;
}
.viewer {
  --background: #000;
}
.viewer ion-toolbar {
  --background: #000;
  --color: #fff;
}
.viewer ion-content {
  --background: #000;
}
.viewer ion-footer .screen {
  --ion-color-primary: #fff;
  background: #000;
  color: #fff;
}
.strip {
  display: flex;
  height: 100%;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  scrollbar-width: none;
}
.slide {
  flex: 0 0 100%;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  scroll-snap-align: center;
  scroll-snap-stop: always;
}
.slide > img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
</style>
