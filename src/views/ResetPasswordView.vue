<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'

import AppButton from '@/components/AppButton.vue'
import AppPage from '@/components/AppPage.vue'
import ErrorText from '@/components/ErrorText.vue'
import FormField from '@/components/FormField.vue'
import { useAuth } from '@/composables/useAuth'
import { newPasswordError } from '@/lib/account'
import { errorMessage } from '@/lib/errors'
import { t } from '@/i18n'

// Forgotten password, in two steps on one screen: the email address gets a code, then the code and a new password
// are sent together. Afterwards the person is signed in with the new password.
const { api, signIn } = useAuth()
const email = ref('')
const code = ref('')
const password = ref('')
const repeat = ref('')
const sent = ref(false)
const error = ref<string | null>(null)
const busy = ref(false)
const address = computed(() => email.value.trim())

async function guarded(work: () => Promise<void>) {
  busy.value = true
  error.value = null
  try {
    await work()
  } catch {
    error.value = t('common.serverNotReachable')
  }
  busy.value = false
}

const sendCode = () =>
  guarded(async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address.value)) {
      error.value = t('account.errors.emailInvalid')
      return
    }
    const { response, error: failure } = await api.POST('/api/password-reset/', { body: { email: address.value } })
    if (response.ok) sent.value = true
    else error.value = errorMessage(failure)
  })

const setPassword = () =>
  guarded(async () => {
    const problem = newPasswordError(password.value, repeat.value)
    if (problem) {
      error.value = t(problem.key, problem.params ?? {})
      return
    }
    const { response, error: failure } = await api.POST('/api/password-reset/confirm/', {
      body: { email: address.value, code: code.value.trim(), new_password: password.value },
    })
    if (!response.ok) {
      error.value = errorMessage(failure)
      return
    }
    error.value = await signIn(address.value, password.value) // signed in: the app moves on to Home
  })
</script>

<template>
  <AppPage :title="$t('auth.reset.title')" back-href="/sign-in">
    <div class="screen">
      <template v-if="!sent">
        <div>{{ $t('auth.reset.intro') }}</div>
        <FormField v-model="email" :label="$t('auth.signIn.email')" type="email" inputmode="email" autocomplete="email" @enter="sendCode" />
        <ErrorText :message="error" />
        <AppButton :busy="busy" @click="sendCode">{{ $t('auth.reset.sendCode') }}</AppButton>
        <RouterLink to="/sign-in">{{ $t('auth.reset.backToSignIn') }}</RouterLink>
      </template>
      <template v-else>
        <div>{{ $t('auth.reset.sent', { email: address }) }}</div>
        <FormField v-model="code" :label="$t('auth.reset.code')" capitalize="characters" autocomplete="one-time-code" />
        <FormField v-model="password" :label="$t('account.new')" type="password" autocomplete="new-password" />
        <FormField v-model="repeat" :label="$t('account.repeat')" type="password" autocomplete="new-password" @enter="setPassword" />
        <ErrorText :message="error" />
        <AppButton :busy="busy" @click="setPassword">{{ $t('auth.reset.setPassword') }}</AppButton>
        <a href="#" @click.prevent="sent = false; error = null">{{ $t('auth.reset.newCode') }}</a>
      </template>
    </div>
  </AppPage>
</template>
