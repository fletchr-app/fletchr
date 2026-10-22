<script setup lang="ts">
import { IonButton } from '@ionic/vue'
import { Capacitor } from '@capacitor/core'
import { Share } from '@capacitor/share'
import { alertController } from '@ionic/vue'
import { ref } from 'vue'
import { useRouter } from 'vue-router'

import AppButton from '@/components/AppButton.vue'
import ErrorText from '@/components/ErrorText.vue'
import { useAuth } from '@/composables/useAuth'
import { errorMessage } from '@/lib/errors'
import { claimMessage } from '@/lib/team-admin'

// What a coach can do with the profile of an archer without an account: link it to their account, rename, delete.
const props = defineProps<{ archerId: number; name: string; teamId: number; teamName: string }>()
const emit = defineEmits<{ renamed: [] }>()

const router = useRouter()
const { api } = useAuth()
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
    error.value = 'Server not reachable'
  }
}

// In the browser the text is copied; on a phone the share sheet opens.
async function share() {
  if (!claim.value) return
  const message = claimMessage(props.teamName, claim.value.code, claim.value.expires_at)
  try {
    if (native) await Share.share({ text: message })
    else {
      await navigator.clipboard.writeText(message)
      note.value = 'Copied. Paste it into a message.'
    }
  } catch {
    note.value = 'Could not copy: select the code above and copy it.'
  }
}

async function rename(name: string) {
  try {
    const { data, error: failure } = await api.PATCH('/api/teams/{team_id}/archers/{user_id}/', { params: { path }, body: { name } })
    if (data) emit('renamed')
    else error.value = errorMessage(failure)
  } catch {
    error.value = 'Server not reachable'
  }
}

async function askName() {
  const alert = await alertController.create({
    header: 'Rename',
    inputs: [{ name: 'name', type: 'text', value: props.name, attributes: { autocapitalize: 'words' } }],
    buttons: [
      { text: 'Cancel', role: 'cancel' },
      { text: 'Save', handler: (value: { name?: string }) => !!value.name?.trim() && void rename(value.name.trim()) },
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
    error.value = 'Server not reachable'
  }
}
</script>

<template>
  <div class="d-flex flex-column gap-2">
    <div class="muted">{{ name }} has no account. When they join, they can take over this profile with a code.</div>
    <div v-if="claim" class="d-flex flex-column gap-1 p-3 rounded border">
      <div class="fs-5 fw-bold selectable" style="letter-spacing: 2px">{{ claim.code }}</div>
      <div class="muted">Works once, until {{ new Date(claim.expires_at).toLocaleDateString() }}. They see who they link to before confirming.</div>
      <IonButton fill="clear" size="small" class="m-0" @click="share">{{ native ? 'Share' : 'Copy message' }}</IonButton>
      <div v-if="note" class="muted">{{ note }}</div>
    </div>
    <AppButton secondary @click="makeCode">{{ claim ? 'New code' : 'Link to an account' }}</AppButton>
    <AppButton secondary @click="askName">Rename</AppButton>
    <AppButton secondary @click="confirmDelete ? remove() : (confirmDelete = true)">
      {{ confirmDelete ? 'Tap again: delete profile, sessions and notes' : 'Delete profile' }}
    </AppButton>
    <ErrorText :message="error" />
  </div>
</template>
