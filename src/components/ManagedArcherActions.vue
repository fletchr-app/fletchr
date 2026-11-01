<script setup lang="ts">
import { IonButton } from '@ionic/vue'
import { Capacitor } from '@capacitor/core'
import { Share } from '@capacitor/share'
import { alertController } from '@ionic/vue'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import AppButton from '@/components/AppButton.vue'
import ErrorText from '@/components/ErrorText.vue'
import { useAuth } from '@/composables/useAuth'
import { useServer } from '@/composables/useServer'
import { joinUrl } from '@/lib/app-link'
import { errorMessage } from '@/lib/errors'
import { formatCode } from '@/lib/codes'
import { untilDate } from '@/lib/team-admin'

// What a coach can do with the profile of an archer without an account: link it to their account, rename, delete.
const props = defineProps<{ archerId: number; name: string; teamId: number; teamName: string }>()
const emit = defineEmits<{ renamed: [] }>()

const { t, locale } = useI18n()
const router = useRouter()
const { api } = useAuth()
const { isOverride } = useServer() // a link to fletchr.de only means something for a code of the official server
const native = Capacitor.isNativePlatform()
const path = { team_id: props.teamId, user_id: props.archerId }
const claim = ref<{ code: string; expires_at: string } | null>(null)
const note = ref<string | null>(null)
const error = ref<string | null>(null)
const confirmDelete = ref(false)

async function makeCode() {
  error.value = note.value = null
  try {
    const { data, error: failure } = await api.POST('/api/teams/{team_id}/archers/{user_id}/claim-code/', { params: { path } })
    if (data) claim.value = data
    else error.value = errorMessage(failure)
  } catch {
    error.value = t('common.serverNotReachable')
  }
}

// In the browser the text is copied; on a phone the share sheet opens.
async function share() {
  if (!claim.value) return
  const words = { team: props.teamName, code: formatCode(claim.value.code), until: untilDate(claim.value.expires_at, locale.value) }
  const message = isOverride.value ? t('teams.claimText', words) : t('teams.claimTextLink', { ...words, link: joinUrl(claim.value.code) })
  try {
    if (native) await Share.share({ text: message })
    else {
      await navigator.clipboard.writeText(message)
      note.value = t('teams.copied')
    }
  } catch {
    note.value = t('teams.copyFailed')
  }
}

async function rename(name: string) {
  try {
    const { data, error: failure } = await api.PATCH('/api/teams/{team_id}/archers/{user_id}/', { params: { path }, body: { name } })
    if (data) emit('renamed')
    else error.value = errorMessage(failure)
  } catch {
    error.value = t('common.serverNotReachable')
  }
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
  try {
    const { response, error: failure } = await api.DELETE('/api/teams/{team_id}/archers/{user_id}/', { params: { path } })
    if (response.ok) void router.replace('/team')
    else error.value = errorMessage(failure)
  } catch {
    error.value = t('common.serverNotReachable')
  }
}
</script>

<template>
  <div class="d-flex flex-column gap-2">
    <div class="muted">{{ $t('archer.hasNoAccount', { name }) }}</div>
    <div v-if="claim" class="d-flex flex-column gap-1 p-3 rounded border">
      <div class="fs-5 fw-bold selectable" style="letter-spacing: 2px">{{ formatCode(claim.code) }}</div>
      <div class="muted">{{ $t('archer.codeInfo', { date: new Date(claim.expires_at).toLocaleDateString() }) }}</div>
      <IonButton fill="clear" size="small" class="m-0" @click="share">{{ native ? $t('teams.share') : $t('archer.copyMessage') }}</IonButton>
      <div v-if="note" class="muted">{{ note }}</div>
    </div>
    <AppButton secondary @click="makeCode">{{ claim ? $t('archer.newCode') : $t('archer.link') }}</AppButton>
    <AppButton secondary @click="askName">{{ $t('archer.rename') }}</AppButton>
    <AppButton secondary :router-link="`/archers/${archerId}/details`">{{ $t('archer.editDetails') }}</AppButton>
    <AppButton secondary @click="confirmDelete ? remove() : (confirmDelete = true)">
      {{ confirmDelete ? $t('archer.deleteConfirm') : $t('archer.deleteProfile') }}
    </AppButton>
    <ErrorText :message="error" />
  </div>
</template>
