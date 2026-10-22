<script setup lang="ts">
import AppPage from '@/components/AppPage.vue'
import { ref } from 'vue'
import { RouterLink } from 'vue-router'

import AppButton from '@/components/AppButton.vue'
import ErrorText from '@/components/ErrorText.vue'
import FormField from '@/components/FormField.vue'
import { useAuth } from '@/composables/useAuth'
import { useServer } from '@/composables/useServer'

const { signIn } = useAuth()
const { url } = useServer()
const email = ref('')
const password = ref('')
const error = ref<string | null>(null)
const busy = ref(false)

async function submit() {
  busy.value = true
  error.value = await signIn(email.value, password.value)
  busy.value = false
}
</script>

<template>
  <AppPage title="Sign in" :back="false">
    <div class="screen">
      <FormField v-model="email" label="Email" type="email" inputmode="email" autocomplete="email" />
      <FormField v-model="password" label="Password" type="password" autocomplete="current-password" @enter="submit" />
      <ErrorText :message="error" />
      <AppButton :busy="busy" @click="submit">Sign in</AppButton>
      <RouterLink to="/register">I have an invite code</RouterLink>
      <div class="muted">Server: {{ url }} <RouterLink to="/settings">change</RouterLink></div>
    </div>
  </AppPage>
</template>
