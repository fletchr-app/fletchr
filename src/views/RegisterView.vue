<script setup lang="ts">
import AppPage from '@/components/AppPage.vue'
import { reactive, ref } from 'vue'

import AppButton from '@/components/AppButton.vue'
import ErrorText from '@/components/ErrorText.vue'
import FormField from '@/components/FormField.vue'
import { useAuth } from '@/composables/useAuth'

const { register } = useAuth()
const form = reactive({ invite_code: '', name: '', email: '', password: '' })
const error = ref<string | null>(null)
const busy = ref(false)

async function submit() {
  busy.value = true
  error.value = await register({ ...form })
  busy.value = false
}
</script>

<template>
  <AppPage title="Join with invite code" back-href="/sign-in">
    <div class="screen">
      <FormField v-model="form.invite_code" label="Invite code" capitalize="characters" />
      <FormField v-model="form.name" label="Name" capitalize="words" autocomplete="name" />
      <FormField v-model="form.email" label="Email" type="email" inputmode="email" autocomplete="email" />
      <FormField v-model="form.password" label="Password" type="password" autocomplete="new-password" @enter="submit" />
      <ErrorText :message="error" />
      <AppButton :busy="busy" @click="submit">Create account</AppButton>
    </div>
  </AppPage>
</template>
