<script setup lang="ts">
import { onIonViewWillEnter } from '@ionic/vue'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

import AppButton from '@/components/AppButton.vue'
import AppPage from '@/components/AppPage.vue'
import ErrorText from '@/components/ErrorText.vue'
import FormField from '@/components/FormField.vue'
import { useAuth } from '@/composables/useAuth'
import { emailFormError, passwordFormError } from '@/lib/account'
import { errorMessage } from '@/lib/errors'

// The sign-in of the account: email address and password. Both need the current password.
const { t } = useI18n()
const { api, replaceTokens } = useAuth()

const email = ref('')
const hasPassword = ref(true) // false for an account made with Google: no password, the address is Google's

onIonViewWillEnter(async () => {
  try {
    const { data } = await api.GET('/api/me/')
    if (data) {
      email.value = data.email
      hasPassword.value = data.has_password
    }
  } catch {
    // Offline: the address stays empty.
  }
})

// One state per section, so a message sits under the form it belongs to.
type Section = { busy: boolean; error: string | null; done: string | null }
const sections = { email: ref<Section>(blank()), password: ref<Section>(blank()) }
function blank(): Section {
  return { busy: false, error: null, done: null }
}
async function run(section: keyof typeof sections, work: () => Promise<string | null>, done: string) {
  const state = sections[section]
  state.value = { busy: true, error: null, done: null }
  try {
    const failure = await work()
    state.value = failure ? { busy: false, error: failure, done: null } : { busy: false, error: null, done }
  } catch {
    state.value = { busy: false, error: t('common.serverNotReachable'), done: null }
  }
}

const newEmail = ref('')
const emailPassword = ref('')
const changeEmail = () =>
  run('email', async () => {
    const problem = emailFormError(emailPassword.value, newEmail.value, email.value)
    if (problem) return t(problem.key, problem.params ?? {})
    const { data, error } = await api.POST('/api/me/email/', { body: { current_password: emailPassword.value, new_email: newEmail.value.trim() } })
    if (!data) return errorMessage(error)
    email.value = data.email
    newEmail.value = emailPassword.value = ''
    return null
  }, t('account.emailChanged'))

const currentPassword = ref('')
const newPassword = ref('')
const repeatPassword = ref('')
const changePassword = () =>
  run('password', async () => {
    const problem = passwordFormError(currentPassword.value, newPassword.value, repeatPassword.value)
    if (problem) return t(problem.key, problem.params ?? {})
    const { data, error } = await api.POST('/api/me/password/', {
      body: { current_password: currentPassword.value, new_password: newPassword.value },
    })
    if (!data) return errorMessage(error)
    replaceTokens(data) // this device stays signed in; the others are signed out
    currentPassword.value = newPassword.value = repeatPassword.value = ''
    return null
  }, t('account.passwordChanged'))
</script>

<template>
  <AppPage :title="$t('account.title')">
    <div v-if="!hasPassword" class="screen">
      <h2 class="h5 m-0">{{ $t('account.email') }}</h2>
      <div>{{ $t('account.googleAccount', { email: email || '…' }) }}</div>
      <div class="muted">{{ $t('account.googleNote') }}</div>
    </div>
    <div v-else class="screen">
      <h2 class="h5 m-0">{{ $t('account.email') }}</h2>
      <div class="muted">{{ $t('account.signInWith', { email: email || '…' }) }}</div>
      <FormField v-model="newEmail" :label="$t('account.newEmail')" type="email" inputmode="email" autocomplete="email" />
      <FormField v-model="emailPassword" :label="$t('account.currentPassword')" type="password" autocomplete="current-password" @enter="changeEmail" />
      <ErrorText :message="sections.email.value.error" />
      <div v-if="sections.email.value.done" class="fw-semibold">{{ sections.email.value.done }}</div>
      <AppButton :busy="sections.email.value.busy" @click="changeEmail">{{ $t('account.changeEmail') }}</AppButton>

      <h2 class="h5 mt-3 mb-0">{{ $t('account.password') }}</h2>
      <FormField v-model="currentPassword" :label="$t('account.current')" type="password" autocomplete="current-password" />
      <FormField v-model="newPassword" :label="$t('account.new')" type="password" autocomplete="new-password" />
      <FormField v-model="repeatPassword" :label="$t('account.repeat')" type="password" autocomplete="new-password" @enter="changePassword" />
      <ErrorText :message="sections.password.value.error" />
      <div v-if="sections.password.value.done" class="fw-semibold">{{ sections.password.value.done }}</div>
      <AppButton :busy="sections.password.value.busy" @click="changePassword">{{ $t('account.changePassword') }}</AppButton>
    </div>
  </AppPage>
</template>
