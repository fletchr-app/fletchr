<script setup lang="ts">
import AppPage from '@/components/AppPage.vue'
import { reactive, ref } from 'vue'

import AppButton from '@/components/AppButton.vue'
import ErrorText from '@/components/ErrorText.vue'
import FormField from '@/components/FormField.vue'
import { useAuth } from '@/composables/useAuth'
import { useCodePreview } from '@/composables/useCodePreview'

const { register } = useAuth()
const { preview, check } = useCodePreview()
const form = reactive({ invite_code: '', name: '', email: '', password: '' })
const error = ref<string | null>(null)
const busy = ref(false)

// An invite creates the account at once. A code for a profile a coach keeps for you asks for confirmation first.
async function submit() {
  busy.value = true
  error.value = null
  if (preview.value?.kind !== 'claim') {
    const found = await check(form.invite_code)
    if ('error' in found) {
      error.value = found.error
      busy.value = false
      return
    }
    if (found.preview.kind === 'claim') {
      busy.value = false // shown below, to confirm
      return
    }
  }
  error.value = await register({ ...form })
  busy.value = false
}

function change() {
  preview.value = null
  error.value = null
}
</script>

<template>
  <AppPage title="Join with invite code" back-href="/sign-in">
    <div class="screen">
      <FormField v-model="form.invite_code" label="Invite code" capitalize="characters" @update:model-value="change" />
      <div v-if="preview?.kind === 'claim'">
        Your coach in <b>{{ preview.team_name }}</b> keeps a profile for <b>{{ preview.profile_name }}</b>. If that is you, create your
        account and its sessions and notes become yours. Notes the coach marked as private stay hidden from you.
      </div>
      <FormField v-model="form.name" label="Name" capitalize="words" autocomplete="name" />
      <FormField v-model="form.email" label="Email" type="email" inputmode="email" autocomplete="email" />
      <FormField v-model="form.password" label="Password" type="password" autocomplete="new-password" @enter="submit" />
      <ErrorText :message="error" />
      <AppButton :busy="busy" @click="submit">
        {{ preview?.kind === 'claim' ? `Create account and link ${preview.profile_name}` : 'Create account' }}
      </AppButton>
    </div>
  </AppPage>
</template>
