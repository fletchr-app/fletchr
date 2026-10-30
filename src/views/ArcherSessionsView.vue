<script setup lang="ts">
import { IonList } from '@ionic/vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'

import AppAvatar from '@/components/AppAvatar.vue'
import AppButton from '@/components/AppButton.vue'
import AppPage from '@/components/AppPage.vue'
import AvatarEditor from '@/components/AvatarEditor.vue'
import ErrorText from '@/components/ErrorText.vue'
import ManagedArcherActions from '@/components/ManagedArcherActions.vue'
import NotesSection from '@/components/NotesSection.vue'
import SessionListItem from '@/components/SessionListItem.vue'
import VideoConsent from '@/components/VideoConsent.vue'
import { useAuth } from '@/composables/useAuth'
import { useLog } from '@/composables/useLog'
import { useRemote } from '@/composables/useRemote'
import { sessionRows } from '@/lib/session-rows'

const REFRESH_MS = 10000

// One archer: their sessions, statistics and the coach notes, for their coach. For an archer without an
// account the coach can also log sessions for them and manage the profile.
const route = useRoute()
const id = route.params.id as string
const name = route.query.name as string | undefined

const { t } = useI18n()
const { api } = useAuth()
const { sessions: local, goneSessions } = useLog()
const info = useRemote(async () => (await api.GET('/api/archers/{user_id}/', { params: { path: { user_id: Number(id) } } })).data ?? null)
const { data, error, loading } = useRemote(async () => (await api.GET('/api/sessions/', { params: { query: { owner: Number(id) } } })).data ?? null, {
  pollMs: REFRESH_MS,
  keepPolling: () => true,
})

const writable = useRemote(async () => (await api.GET('/api/notes/teams/', { params: { query: { archer: Number(id) } } })).data ?? null)
const title = computed(() => info.data.value?.name || name || t('archer.defaultTitle'))
const shownName = computed(() => info.data.value?.name || name || '')
const side = (v: string) => (v === 'right' ? t('account.right') : v === 'left' ? t('account.left') : '')
const profileLine = computed(() => {
  const a = info.data.value
  if (!a) return ''
  return [a.dominant_hand && t('archer.handIs', { side: side(a.dominant_hand) }), a.dominant_eye && t('archer.eyeIs', { side: side(a.dominant_eye) }), a.age !== null && a.age !== undefined && t('archer.ageIs', { n: a.age })]
    .filter(Boolean)
    .join(' · ')
})
// Sessions the coach logged on this device (editable), then those the server has.
const events = useRemote(async () => (await api.GET('/api/events/mine/', { params: { query: { archer: Number(id) } } })).data ?? null, {
  pollMs: REFRESH_MS,
  keepPolling: () => true,
})
const rows = computed(() => sessionRows(local.value.filter((s) => s.owner === Number(id)), data.value ?? [], goneSessions.value, events.data.value ?? [], Number(id)))
</script>

<template>
  <AppPage :title="title">
    <div class="screen">
      <AvatarEditor
        v-if="info.data.value?.managed && info.data.value.team_id"
        :name="shownName"
        :url="info.data.value.avatar_url"
        :allowed="info.data.value.avatar_allowed"
        :archer="{ teamId: info.data.value.team_id, userId: Number(id) }"
        @changed="info.reload"
      />
      <div v-else-if="info.data.value?.avatar_url" class="d-flex justify-content-center"><AppAvatar :name="shownName" :url="info.data.value.avatar_url" :size="96" /></div>
      <div v-if="profileLine" class="muted">{{ profileLine }}</div>
      <AppButton v-if="info.data.value?.managed" :router-link="`/training/new?for=${id}&name=${encodeURIComponent(shownName)}`">{{ $t('archer.startFor', { name: shownName }) }}</AppButton>
      <AppButton v-if="info.data.value" secondary :router-link="`/training/new?for=${id}&name=${encodeURIComponent(shownName)}&open=1&managed=${info.data.value.managed ? 1 : 0}`">{{ $t('archer.openSession') }}</AppButton>
      <AppButton secondary :router-link="`/archers/${id}/stats?name=${encodeURIComponent(shownName)}`">{{ $t('archer.statistics') }}</AppButton>
      <AppButton v-if="writable.data.value?.length" :router-link="`/evaluate?archer=${id}&kind=coach&name=${encodeURIComponent(shownName)}`">{{ $t('evaluations.new') }}</AppButton>
      <AppButton secondary :router-link="`/archers/${id}/evaluations?name=${encodeURIComponent(shownName)}`">{{ $t('evaluations.title') }}</AppButton>
      <AppButton secondary :router-link="`/media?owner=${id}&name=${encodeURIComponent(shownName)}`">{{ $t('media.title') }}</AppButton>
      <VideoConsent v-if="info.data.value && info.data.value.age !== null && info.data.value.age !== undefined && info.data.value.age < 18" :archer="info.data.value" @changed="info.reload" />
      <NotesSection :archer-id="Number(id)" />
      <ErrorText :message="error" />
      <div v-if="loading">{{ $t('common.loading') }}</div>
      <div v-if="!loading && rows.length === 0">{{ $t('archer.noSessions') }}</div>
      <IonList v-if="rows.length > 0" inset>
        <SessionListItem v-for="row in rows" :key="row.id" :row="row" />
      </IonList>
      <ManagedArcherActions
        v-if="info.data.value?.managed && info.data.value.team_id"
        :archer-id="Number(id)"
        :name="shownName"
        :team-id="info.data.value.team_id"
        :team-name="info.data.value.team_name ?? ''"
        @renamed="info.reload"
      />
    </div>
  </AppPage>
</template>
