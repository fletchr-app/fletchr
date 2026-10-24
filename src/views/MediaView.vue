<script setup lang="ts">
import { IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonModal, IonSpinner, IonTitle, IonToolbar, onIonViewWillEnter } from '@ionic/vue'
import { cloudUploadOutline } from 'ionicons/icons'
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
import type { components } from '@/lib/api-types'
import { prepareImage } from '@/lib/image'
import { loadFiles, loadThumbnail } from '@/lib/media-files'
import type { QueuedMedia } from '@/lib/media-queue'
import { pickPhoto } from '@/lib/pick-photo'

type Remote = components['schemas']['Media']
type Preparing = { key: string; src: string; error?: string }
type Shown = { key: string; src: string; queued?: QueuedMedia; remote?: Remote; preparing?: Preparing }

// The photos (and later videos) of one session, or of one archer. Everyone can add to their own sessions, and a
// coach to those of their archers: that shows as ?owner=. What is added waits on the phone until it is uploaded.
const { t } = useI18n()
const route = useRoute()
const sessionId = (route.query.session as string | undefined) ?? null
const ownerParam = route.query.owner ? Number(route.query.owner) : null
const name = route.query.name as string | undefined
const title = name ? t('media.titleFor', { name }) : t('media.title')

const { api, userId } = useAuth()
const media = useMedia()
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
onBeforeUnmount(() => {
  Object.values(previews.value).forEach((u) => URL.revokeObjectURL(u))
  preparing.value.forEach((p) => URL.revokeObjectURL(p.src))
})

// Photos being prepared (shrunk and saved on the phone) show at once, where they will be in the list. One that fails stays, with its error.
const preparing = ref<Preparing[]>([])
const shown = computed<Shown[]>(() => [
  ...queued.value.map((q) => ({ key: q.id, src: previews.value[q.id] ?? '', queued: q })),
  ...preparing.value.map((p) => ({ key: p.key, src: p.src, preparing: p })),
  ...(data.value ?? []).filter((r) => !queued.value.some((q) => q.id === r.id)).map((r) => ({ key: r.id, src: r.thumbnail_url, remote: r })),
])

const adding = ref(false)
const addError = ref<string | null>(null)
function stopPreparing(key: string) {
  const tile = preparing.value.find((p) => p.key === key)
  if (tile) URL.revokeObjectURL(tile.src)
  preparing.value = preparing.value.filter((p) => p.key !== key)
}
async function add() {
  adding.value = true
  addError.value = null
  let key: string | null = null
  try {
    const picked = await pickPhoto()
    if (!picked) return
    key = `preparing-${Date.now()}`
    preparing.value = [...preparing.value, { key, src: URL.createObjectURL(picked) }]
    adding.value = false // the next photo can be picked while this one is prepared
    const { file, thumbnail, width, height } = await prepareImage(picked)
    const id = await media.enqueue(
      { kind: 'photo', owner: owner.value === me.value ? null : owner.value, session: sessionId, taken_at: new Date().toISOString(), width, height },
      { file, thumbnail },
    )
    previews.value = { ...previews.value, [id]: URL.createObjectURL(thumbnail) } // so the tile does not blink when it changes
    stopPreparing(key)
  } catch {
    const tile = preparing.value.find((p) => p.key === key)
    if (tile) tile.error = t('media.couldNotAdd')
    else addError.value = t('media.couldNotAdd')
  } finally {
    adding.value = false
  }
}

// The big picture.
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
  if (item.queued) {
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
    setTimeout(() => URL.revokeObjectURL(keep), 500) // the modal still shows it while it closes
  } else if (item.queued) media.remove(item.queued.id)
  else {
    const { response } = await api.DELETE('/api/media/{media_id}/', { params: { path: { media_id: item.remote!.id } } }).catch(() => ({ response: null }))
    if (!response || !(response.ok || response.status === 404)) return (deleteError.value = t('common.nothingDeleted'))
    reload()
  }
  close()
}
</script>

<template>
  <AppPage :title="title">
    <div class="screen">
      <AppButton :busy="adding" @click="add">{{ $t('media.add') }}</AppButton>
      <ErrorText :message="addError" />
      <SyncBanner />
      <ErrorText :message="error" />
      <div v-if="loading && shown.length === 0">{{ $t('common.loading') }}</div>
      <div v-else-if="shown.length === 0 && !error">{{ $t('media.empty') }}</div>
      <div class="grid">
        <button v-for="item in shown" :key="item.key" type="button" class="cell" @click="open(item)">
          <img :src="item.src" alt="" />
          <IonIcon v-if="item.queued && !item.queued.error" :icon="cloudUploadOutline" class="badge" :title="$t('media.waiting')" />
          <span v-if="item.queued?.error || item.preparing?.error" class="badge text-danger">!</span>
          <span v-if="item.preparing && !item.preparing.error" class="veil" :title="$t('media.preparing')"><IonSpinner name="crescent" /></span>
        </button>
      </div>
    </div>
    <IonModal :is-open="viewing !== null" @did-dismiss="close">
      <IonHeader>
        <IonToolbar>
          <IonTitle>{{ viewing?.remote ? new Date(viewing.remote.taken_at).toLocaleString() : viewing?.queued ? new Date(viewing.queued.taken_at).toLocaleString() : '' }}</IonTitle>
          <IonButtons slot="end"><IonButton @click="close">{{ $t('media.close') }}</IonButton></IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent>
        <div class="screen">
          <img :src="bigSrc" alt="" class="big" />
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
  align-items: center;
  justify-content: center;
  background: rgb(0 0 0 / 40%);
  color: #fff;
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
.big {
  width: 100%;
  max-height: 70vh;
  object-fit: contain;
}
</style>
