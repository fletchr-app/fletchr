<script setup lang="ts">
import { IonList } from '@ionic/vue'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'

import AppAvatar from '@/components/AppAvatar.vue'
import AppPage from '@/components/AppPage.vue'
import ArcherEvaluations from '@/components/ArcherEvaluations.vue'
import ArcherEquipmentSummary from '@/components/ArcherEquipmentSummary.vue'
import ArcherMenu from '@/components/ArcherMenu.vue'
import ArcherPhotos from '@/components/ArcherPhotos.vue'
import ArcherStatsSummary from '@/components/ArcherStatsSummary.vue'
import AvatarEditor from '@/components/AvatarEditor.vue'
import ErrorText from '@/components/ErrorText.vue'
import SessionListItem from '@/components/SessionListItem.vue'
import SectionLink from '@/components/SectionLink.vue'
import { useArcherSessions } from '@/composables/useArcherSessions'
import { useAuth } from '@/composables/useAuth'
import { useNoteLibrary } from '@/composables/useNoteLibrary'
import { useRemote } from '@/composables/useRemote'

const REFRESH_MS = 10000

// An archer as their coach sees them: picture and name, the equipment, the latest training, statistics, the latest photos and
// the latest coach note, each with a plus for a new one and an arrow to the rest.
// The actions are in a menu in the app bar (ArcherMenu).
// For an archer without an account the coach can also log sessions for them and manage the profile.
const route = useRoute()
const id = Number(route.params.id)
const name = route.query.name as string | undefined

const { t } = useI18n()
const { api } = useAuth()
const info = useRemote(async () => (await api.GET('/api/archers/{user_id}/', { params: { path: { user_id: id } } })).data ?? null)
const { rows, error, loading } = useArcherSessions(id)
const writable = useRemote(async () => (await api.GET('/api/notes/teams/', { params: { query: { archer: id } } })).data ?? null)
const noteLibrary = useNoteLibrary()
const notes = useRemote(async () => noteLibrary.list({ archer: id }), { pollMs: REFRESH_MS, keepPolling: () => true })
const latestNote = computed(() => [...(notes.data.value ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at))[0])
const menuError = ref<string | null>(null)
const noCover = computed(() => !info.data.value?.avatar_url || coverBroken.value)
// A new training: a full session for an archer without an account, an opened one (photos, videos, notes) for the others.
const newTraining = computed(() => {
  const a = info.data.value
  if (!a) return undefined
  const base = `/training/new?for=${id}&name=${encodeURIComponent(shownName.value)}`
  return a.managed ? base : `${base}&open=1&managed=0`
})
const avatarEditor = ref<InstanceType<typeof AvatarEditor> | null>(null)
// The picture as the page's cover; when the link has run out it is left out and the initials show.
const coverBroken = ref(false)
watch(() => info.data.value?.avatar_url, () => (coverBroken.value = false))

const shownName = computed(() => info.data.value?.name || name || '')
const side = (v: string) => (v === 'right' ? t('account.right') : v === 'left' ? t('account.left') : '')
const profileLine = computed(() => {
  const a = info.data.value
  if (!a) return ''
  return [a.dominant_hand && t('archer.handIs', { side: side(a.dominant_hand) }), a.dominant_eye && t('archer.eyeIs', { side: side(a.dominant_eye) }), a.age !== null && a.age !== undefined && t('archer.ageIs', { n: a.age })]
    .filter(Boolean)
    .join(' · ')
})
const underage = computed(() => info.data.value?.age !== null && info.data.value?.age !== undefined && info.data.value.age < 18)
const consent = computed(() => {
  const a = info.data.value
  if (!a || !underage.value) return ''
  return a.video_consent_at
    ? t('consent.given', { who: a.video_consent_by ?? '', date: new Date(a.video_consent_at).toLocaleDateString() })
    : t('consent.missing', { name: a.name })
})
</script>

<template>
  <AppPage :title="shownName || $t('archer.defaultTitle')">
    <template #actions>
      <ArcherMenu :archer="info.data.value" :archer-id="id" :name="shownName" @changed="info.reload" @renamed="info.reload" @picture="avatarEditor?.choose()" @error="menuError = $event" />
    </template>
    <div class="screen">
      <AvatarEditor
        v-if="info.data.value?.managed && info.data.value.team_id"
        ref="avatarEditor"
        bare
        :name="shownName"
        :url="info.data.value.avatar_url"
        :allowed="info.data.value.avatar_allowed"
        :archer="{ teamId: info.data.value.team_id, userId: id }"
        @changed="info.reload"
      />
      <img v-if="info.data.value?.avatar_url && !coverBroken" :src="info.data.value.avatar_url" :alt="$t('avatar.alt', { name: shownName })" class="cover" @error="coverBroken = true" />
      <div v-if="noCover || profileLine" class="d-flex align-items-center gap-3">
        <AppAvatar v-if="noCover" :name="shownName" :size="72" />
        <div v-if="profileLine" class="muted min-w-0">{{ profileLine }}</div>
      </div>
      <div v-if="info.data.value?.managed" class="muted">{{ $t('archer.hasNoAccount', { name: shownName }) }}</div>
      <div v-if="consent" class="muted">{{ consent }}</div>
      <ErrorText :message="menuError" />

      <ArcherEquipmentSummary :archer-id="id" :name="shownName" />

      <div class="d-flex flex-column gap-2">
        <div class="d-flex align-items-center justify-content-between">
          <h2 class="h5 m-0">{{ $t('archer.latestTraining') }}</h2>
          <SectionLink :add="newTraining" :add-label="info.data.value?.managed ? $t('archer.startFor', { name: shownName }) : $t('archer.openSession')" :to="rows.length > 1 ? `/archers/${id}/sessions?name=${encodeURIComponent(shownName)}` : undefined" />
        </div>
        <ErrorText :message="error" />
        <div v-if="loading">{{ $t('common.loading') }}</div>
        <div v-else-if="rows.length === 0">{{ $t('archer.noSessions') }}</div>
        <IonList v-else inset class="m-0">
          <SessionListItem :row="rows[0]!" />
        </IonList>
      </div>

      <ArcherEvaluations :archer-id="id" :name="shownName" :can-evaluate="!!writable.data.value?.length" />

      <ArcherStatsSummary :archer-id="id" :name="shownName" />
      <ArcherPhotos :archer-id="id" :name="shownName" />

      <div class="d-flex flex-column gap-2">
        <div class="d-flex align-items-center justify-content-between">
          <h2 class="h5 m-0">{{ $t('notes.coachNotes') }}</h2>
          <SectionLink
            :add="writable.data.value?.length ? `/archers/${id}/notes?name=${encodeURIComponent(shownName)}` : undefined"
            :add-label="$t('notes.newNote')"
            :to="latestNote ? `/archers/${id}/notes?name=${encodeURIComponent(shownName)}` : undefined"
          />
        </div>
        <div v-if="latestNote" class="note">
          <div class="muted">{{ new Date(latestNote.created_at).toLocaleDateString() }}</div>
          <div class="clamp">{{ latestNote.body }}</div>
        </div>
        <div v-else-if="notes.data.value">{{ $t('archer.noNotes') }}</div>
      </div>
    </div>
  </AppPage>
</template>

<style scoped>
.cover {
  display: block;
  width: 100%;
  height: 240px;
  object-fit: cover;
  object-position: center 25%;
  border-radius: 12px;
}
.min-w-0 {
  min-width: 0;
}
.clamp {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  white-space: pre-line;
}
</style>
