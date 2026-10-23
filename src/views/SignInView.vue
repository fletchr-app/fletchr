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
  <AppPage :title="$t('auth.signIn.title')" :back="false">
    <div class="screen">
      <FormField v-model="email" :label="$t('auth.signIn.email')" type="email" inputmode="email" autocomplete="email" />
      <FormField v-model="password" :label="$t('auth.signIn.password')" type="password" autocomplete="current-password" @enter="submit" />
      <ErrorText :message="error" />
      <AppButton :busy="busy" @click="submit">{{ $t('auth.signIn.button') }}</AppButton>
      <RouterLink to="/reset-password">{{ $t('auth.signIn.forgot') }}</RouterLink>
      <RouterLink to="/register">{{ $t('auth.signIn.haveInvite') }}</RouterLink>
      <div class="muted">{{ $t('auth.signIn.server', { url }) }} <RouterLink to="/settings/server">{{ $t('auth.signIn.change') }}</RouterLink></div>
    </div>
  </AppPage>
</template>
