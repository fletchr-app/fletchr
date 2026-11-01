<script setup lang="ts">
import { IonButton } from '@ionic/vue'
import { Capacitor } from '@capacitor/core'
import { Share } from '@capacitor/share'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { useAuth } from '@/composables/useAuth'
import { useServer } from '@/composables/useServer'
import { joinUrl } from '@/lib/app-link'
import type { components } from '@/lib/api-types'
import { formatCode } from '@/lib/codes'
import { untilDate } from '@/lib/team-admin'

type Invite = components['schemas']['Invite']

const props = defineProps<{ teamId: number; teamName: string; invite: Invite }>()
const emit = defineEmits<{ changed: [] }>()

const { t, locale } = useI18n()
const { api } = useAuth()
const { isOverride } = useServer() // a link to fletchr.de only means something for a code of the official server
const native = Capacitor.isNativePlatform()
const note = ref<string | null>(null)
const confirmCancel = ref(false)

// In the browser the text is copied; on a phone the share sheet opens.
async function share() {
  const words = { team: props.teamName, code: formatCode(props.invite.code), until: untilDate(props.invite.expires_at, locale.value) }
  const message = isOverride.value ? t('teams.inviteText', words) : t('teams.inviteTextLink', { ...words, link: joinUrl(props.invite.code) })
  try {
    if (native) {
      await Share.share({ text: message })
      note.value = ''
    } else {
      await navigator.clipboard.writeText(message)
      note.value = t('teams.copied')
    }
  } catch {
    note.value = t('teams.copyFailed')
  }
}

async function cancel() {
  try {
    const { response } = await api.DELETE('/api/teams/{team_id}/invites/{id}/', { params: { path: { team_id: props.teamId, id: props.invite.id } } })
    if (response.ok) emit('changed')
    else note.value = t('teams.cancelFailed')
  } catch {
    note.value = t('common.serverNotReachable')
  }
}
</script>

<template>
  <div class="d-flex flex-column gap-1 p-3 rounded border">
    <div class="fs-5 fw-bold user-select-all" style="letter-spacing: 2px">{{ formatCode(invite.code) }}</div>
    <div class="muted">{{ $t('teams.inviteUntil', { role: $t(`roles.${invite.role ?? 'archer'}`), date: new Date(invite.expires_at).toLocaleDateString() }) }}</div>
    <div class="d-flex gap-3">
      <IonButton fill="clear" size="small" class="m-0" @click="share">{{ native ? $t('teams.share') : $t('teams.copyText') }}</IonButton>
      <IonButton fill="clear" size="small" class="m-0" @click="confirmCancel ? cancel() : (confirmCancel = true)">{{ confirmCancel ? $t('teams.cancelInviteConfirm') : $t('teams.cancelInvite') }}</IonButton>
    </div>
    <div v-if="note" class="muted">{{ note }}</div>
  </div>
</template>
