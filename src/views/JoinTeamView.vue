<script setup lang="ts">
import AppPage from '@/components/AppPage.vue'
import { ref } from 'vue'
import { useRouter } from 'vue-router'

import AppButton from '@/components/AppButton.vue'
import ErrorText from '@/components/ErrorText.vue'
import FormField from '@/components/FormField.vue'
import { useAuth } from '@/composables/useAuth'
import { useCodePreview } from '@/composables/useCodePreview'
import { errorMessage } from '@/lib/errors'

const router = useRouter()
const { api } = useAuth()
const { preview, check } = useCodePreview()
const code = ref('')
const error = ref<string | null>(null)
const busy = ref(false)

// An invite joins at once. A code for a profile a coach keeps asks for confirmation first.
async function submit() {
  busy.value = true
  error.value = null
  const found = await check(code.value)
  if ('error' in found) error.value = found.error
  else if (found.preview.kind === 'invite') await redeem('/api/invites/redeem/')
  busy.value = false
}

async function redeem(path: '/api/invites/redeem/' | '/api/claims/redeem/') {
  busy.value = true
  error.value = null
  try {
    const { data, error: failure } = await api.POST(path, { body: { invite_code: code.value.trim() } })
    if (data) void router.replace('/')
    else error.value = errorMessage(failure)
  } catch {
    error.value = 'Server not reachable'
  }
  busy.value = false
}

function change() {
  preview.value = null
  error.value = null
}
</script>

<template>
  <AppPage title="Join a team">
    <div class="screen">
      <FormField v-model="code" label="Invite code" capitalize="characters" @update:model-value="change" @enter="submit" />
      <template v-if="preview?.kind === 'claim'">
        <div>
          Your coach in <b>{{ preview.team_name }}</b> keeps a profile for <b>{{ preview.profile_name }}</b>. If that is you, link it to your
          account: its sessions and notes become yours. Notes the coach marked as private stay hidden from you.
        </div>
        <ErrorText :message="error" />
        <AppButton :busy="busy" @click="redeem('/api/claims/redeem/')">Link {{ preview.profile_name }} to my account</AppButton>
        <AppButton secondary @click="change">Cancel</AppButton>
      </template>
      <template v-else>
        <ErrorText :message="error" />
        <AppButton :busy="busy" @click="submit">Join team</AppButton>
      </template>
    </div>
  </AppPage>
</template>
