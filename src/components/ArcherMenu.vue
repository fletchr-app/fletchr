<script setup lang="ts">
import { Capacitor } from '@capacitor/core'
import { Share } from '@capacitor/share'
import { alertController, IonButton, IonIcon, IonItem, IonList, IonPopover } from '@ionic/vue'
import { ellipsisVertical } from 'ionicons/icons'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import { useAuth } from '@/composables/useAuth'
import { useServer } from '@/composables/useServer'
import type { components } from '@/lib/api-types'
import { joinUrl } from '@/lib/app-link'
import { formatCode } from '@/lib/codes'
import { errorMessage } from '@/lib/errors'
import { untilDate } from '@/lib/team-admin'

type Archer = components['schemas']['Archer']

// The right of the app bar of an archer: a menu (a new training and an evaluation are the plus of their sections). A coach can rename, link and delete
// the profile of an archer without an account; for an archer under 18 the menu records the parents' consent to video.
const props = defineProps<{ archer: Archer | null; archerId: number; name: string }>()
const emit = defineEmits<{ changed: []; renamed: []; picture: []; error: [message: string | null] }>()

const { t, locale } = useI18n()
const router = useRouter()
const { api } = useAuth()
const { isOverride } = useServer() // a link to fletchr.de only means something for a code of the official server
const native = Capacitor.isNativePlatform()

const nameQuery = computed(() => encodeURIComponent(props.name))
const managed = computed(() => !!props.archer?.managed && !!props.archer.team_id)
const underage = computed(() => props.archer?.age !== null && props.archer?.age !== undefined && props.archer.age < 18)
const consentGiven = computed(() => !!props.archer?.video_consent_at)
const path = computed(() => ({ team_id: props.archer?.team_id ?? 0, user_id: props.archerId }))

async function call(request: () => Promise<{ ok: boolean; failure?: unknown }>) {
  emit('error', null)
  try {
    const { ok, failure } = await request()
    if (ok) return true
    emit('error', errorMessage(failure))
  } catch {
    emit('error', t('common.serverNotReachable'))
  }
  return false
}

async function changeConsent() {
  const params = { params: { path: { user_id: props.archerId } } }
  const done = await call(async () => {
    const { response, error } = consentGiven.value ? await api.DELETE('/api/archers/{user_id}/video-consent/', params) : await api.PUT('/api/archers/{user_id}/video-consent/', params)
    return { ok: response.ok, failure: error }
  })
  if (done) emit('changed')
}

// The code is shown in a dialog; on a phone its button opens the share sheet, in the browser it copies the message.
async function makeCode() {
  emit('error', null)
  let claim: { code: string; expires_at: string } | undefined
  try {
    const { data, error } = await api.POST('/api/teams/{team_id}/archers/{user_id}/claim-code/', { params: { path: path.value } })
    if (data) claim = data
    else emit('error', errorMessage(error))
  } catch {
    emit('error', t('common.serverNotReachable'))
  }
  if (!claim) return
  const words = { team: props.archer?.team_name ?? '', code: formatCode(claim.code), until: untilDate(claim.expires_at, locale.value) }
  const message = isOverride.value ? t('teams.claimText', words) : t('teams.claimTextLink', { ...words, link: joinUrl(claim.code) })
  const alert = await alertController.create({
    header: t('archer.link'),
    message: `<strong>${formatCode(claim.code)}</strong><br>${t('archer.codeInfo', { date: new Date(claim.expires_at).toLocaleDateString() })}`,
    buttons: [
      { text: t('common.close'), role: 'cancel' },
      {
        text: native ? t('teams.share') : t('archer.copyMessage'),
        handler: () => {
          void (native ? Share.share({ text: message }) : navigator.clipboard.writeText(message)).catch(() => emit('error', t('archer.copyFailed')))
        },
      },
    ],
  })
  await alert.present()
}

async function rename(name: string) {
  const done = await call(async () => {
    const { data, error } = await api.PATCH('/api/teams/{team_id}/archers/{user_id}/', { params: { path: path.value }, body: { name } })
    return { ok: !!data, failure: error }
  })
  if (done) emit('renamed')
}

async function askName() {
  const alert = await alertController.create({
    header: t('archer.rename'),
    inputs: [{ name: 'name', type: 'text', value: props.name, attributes: { autocapitalize: 'words' } }],
    buttons: [
      { text: t('common.cancel'), role: 'cancel' },
      { text: t('common.save'), handler: (value: { name?: string }) => !!value.name?.trim() && void rename(value.name.trim()) },
    ],
  })
  await alert.present()
}

async function remove() {
  const done = await call(async () => {
    const { response, error } = await api.DELETE('/api/teams/{team_id}/archers/{user_id}/', { params: { path: path.value } })
    return { ok: response.ok, failure: error }
  })
  if (done) void router.replace('/team')
}

async function askDelete() {
  const alert = await alertController.create({
    header: t('archer.deleteProfile'),
    message: t('archer.deleteMessage', { name: props.name }),
    buttons: [
      { text: t('common.cancel'), role: 'cancel' },
      { text: t('common.delete'), role: 'destructive', handler: () => void remove() },
    ],
  })
  await alert.present()
}
</script>

<template>
  <IonButton :id="`archer-menu-${archerId}`" :aria-label="$t('archer.menu')"><IonIcon slot="icon-only" :icon="ellipsisVertical" /></IonButton>
  <IonPopover :trigger="`archer-menu-${archerId}`" dismiss-on-select>
    <IonList lines="none">
      <IonItem v-if="archer?.managed" button :detail="false" :router-link="`/training/new?for=${archerId}&name=${nameQuery}&open=1&managed=1`">{{ $t('archer.openSession') }}</IonItem>
      <IonItem v-if="underage" button :detail="false" @click="changeConsent">{{ consentGiven ? $t('consent.withdraw') : $t('consent.record') }}</IonItem>
      <template v-if="managed">
        <IonItem v-if="archer?.avatar_allowed" button :detail="false" @click="emit('picture')">{{ archer.avatar_url ? $t('avatar.change') : $t('avatar.add') }}</IonItem>
        <IonItem button :detail="false" :router-link="`/archers/${archerId}/details`">{{ $t('archer.editDetails') }}</IonItem>
        <IonItem button :detail="false" @click="makeCode">{{ $t('archer.link') }}</IonItem>
        <IonItem button :detail="false" @click="askName">{{ $t('archer.rename') }}</IonItem>
        <IonItem button :detail="false" @click="askDelete">{{ $t('archer.deleteProfile') }}</IonItem>
      </template>
    </IonList>
  </IonPopover>
</template>
