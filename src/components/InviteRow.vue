<script setup lang="ts">
import { IonButton } from '@ionic/vue'
import { Capacitor } from '@capacitor/core'
import { Share } from '@capacitor/share'
import { ref } from 'vue'

import { useAuth } from '@/composables/useAuth'
import type { components } from '@/lib/api-types'
import { formatCode } from '@/lib/codes'
import { inviteMessage, roleLabel } from '@/lib/team-admin'

type Invite = components['schemas']['Invite']

const props = defineProps<{ teamId: number; teamName: string; invite: Invite }>()
const emit = defineEmits<{ changed: [] }>()

const { api } = useAuth()
const native = Capacitor.isNativePlatform()
const note = ref<string | null>(null)
const confirmCancel = ref(false)

// In the browser the text is copied; on a phone the share sheet opens.
async function share() {
  const message = inviteMessage(props.teamName, props.invite.code, props.invite.expires_at)
  try {
    if (native) {
      await Share.share({ text: message })
      note.value = ''
    } else {
      await navigator.clipboard.writeText(message)
      note.value = 'Copied. Paste it into a message.'
    }
  } catch {
    note.value = 'Could not copy: select the code above and copy it.'
  }
}

async function cancel() {
  try {
    const { response } = await api.DELETE('/api/teams/{team_id}/invites/{id}/', { params: { path: { team_id: props.teamId, id: props.invite.id } } })
    if (response.ok) emit('changed')
    else note.value = 'Could not cancel this invite'
  } catch {
    note.value = 'Server not reachable'
  }
}
</script>

<template>
  <div class="d-flex flex-column gap-1 p-3 rounded border">
    <div class="fs-5 fw-bold user-select-all" style="letter-spacing: 2px">{{ formatCode(invite.code) }}</div>
    <div class="muted">{{ roleLabel(invite.role ?? 'archer') }} · until {{ new Date(invite.expires_at).toLocaleDateString() }}</div>
    <div class="d-flex gap-3">
      <IonButton fill="clear" size="small" class="m-0" @click="share">{{ native ? 'Share' : 'Copy invite text' }}</IonButton>
      <IonButton fill="clear" size="small" class="m-0" @click="confirmCancel ? cancel() : (confirmCancel = true)">{{ confirmCancel ? 'Tap again to cancel the invite' : 'Cancel invite' }}</IonButton>
    </div>
    <div v-if="note" class="muted">{{ note }}</div>
  </div>
</template>
