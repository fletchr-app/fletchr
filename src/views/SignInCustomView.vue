<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'

import AppButton from '@/components/AppButton.vue'
import AppPage from '@/components/AppPage.vue'
import ErrorText from '@/components/ErrorText.vue'
import FormField from '@/components/FormField.vue'
import { useAuth } from '@/composables/useAuth'
import { lastCustomServer } from '@/composables/useServer'
import { useCustomServer } from '@/composables/useCustomServer'

// Sign in at a server other than the official one. Google is not offered here (see googleAvailable in useAuth).
const router = useRouter()
const { signIn } = useAuth()
const { use } = useCustomServer()
const server = ref(lastCustomServer())
const email = ref('')
const password = ref('')
const serverError = ref<string | null>(null)
const error = ref<string | null>(null)
const busy = ref(false)

async function go(work: () => Promise<void>) {
  busy.value = true
  serverError.value = error.value = null
  const result = await use(server.value)
  if ('error' in result) serverError.value = result.error
  else {
    server.value = result.url
    await work()
  }
  busy.value = false
}

const submit = () =>
  go(async () => {
    error.value = await signIn(email.value, password.value)
  })
</script>

<template>
  <AppPage :title="$t('auth.custom.title')" back-href="/sign-in">
    <div class="screen">
      <div class="muted">{{ $t('auth.custom.intro') }}</div>
      <FormField v-model="server" :label="$t('auth.custom.server')" inputmode="url" placeholder="https://" />
      <ErrorText :message="serverError" />
      <FormField v-model="email" :label="$t('auth.signIn.email')" type="email" inputmode="email" autocomplete="email" />
      <FormField v-model="password" :label="$t('auth.signIn.password')" type="password" autocomplete="current-password" @enter="submit" />
      <ErrorText :message="error" />
      <AppButton :busy="busy" @click="submit">{{ $t('auth.signIn.button') }}</AppButton>
      <a href="#" @click.prevent="go(async () => void (await router.push('/sign-in/custom/reset-password')))">{{ $t('auth.signIn.forgot') }}</a>
      <a href="#" @click.prevent="go(async () => void (await router.push('/sign-in/custom/register')))">{{ $t('auth.signIn.haveInvite') }}</a>
    </div>
  </AppPage>
</template>
