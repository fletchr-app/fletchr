<script setup lang="ts">
import { onIonViewWillEnter } from '@ionic/vue'
import { ref } from 'vue'

import AppButton from '@/components/AppButton.vue'
import AppPage from '@/components/AppPage.vue'
import ErrorText from '@/components/ErrorText.vue'
import FormField from '@/components/FormField.vue'
import { useAuth } from '@/composables/useAuth'
import { emailFormError, passwordFormError } from '@/lib/account'
import { errorMessage } from '@/lib/errors'

// Name, email address (the login) and password of the account. Email and password need the current password.
const { api, replaceTokens } = useAuth()

const email = ref('')
const name = ref('')
const savedName = ref('')

onIonViewWillEnter(async () => {
  try {
    const { data } = await api.GET('/api/me/')
    if (data) {
      email.value = data.email
      name.value = savedName.value = data.profile.name ?? ''
    }
  } catch {
    // Offline: the form stays empty.
  }
})

// One state per section, so a message sits under the form it belongs to.
type Section = { busy: boolean; error: string | null; done: string | null }
const sections = { name: ref<Section>(blank()), email: ref<Section>(blank()), password: ref<Section>(blank()) }
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
    state.value = { busy: false, error: 'Server not reachable', done: null }
  }
}

const saveName = () =>
  run('name', async () => {
    if (name.value.trim() === savedName.value) return null
    const { data, error } = await api.PATCH('/api/me/', { body: { profile: { name: name.value.trim() } } })
    if (!data) return errorMessage(error)
    savedName.value = name.value = data.profile.name ?? ''
    return null
  }, 'Saved.')

const newEmail = ref('')
const emailPassword = ref('')
const changeEmail = () =>
  run('email', async () => {
    const problem = emailFormError(emailPassword.value, newEmail.value, email.value)
    if (problem) return problem
    const { data, error } = await api.POST('/api/me/email/', { body: { current_password: emailPassword.value, new_email: newEmail.value.trim() } })
    if (!data) return errorMessage(error)
    email.value = data.email
    newEmail.value = emailPassword.value = ''
    return null
  }, 'Your sign-in address is changed.')

const currentPassword = ref('')
const newPassword = ref('')
const repeatPassword = ref('')
const changePassword = () =>
  run('password', async () => {
    const problem = passwordFormError(currentPassword.value, newPassword.value, repeatPassword.value)
    if (problem) return problem
    const { data, error } = await api.POST('/api/me/password/', {
      body: { current_password: currentPassword.value, new_password: newPassword.value },
    })
    if (!data) return errorMessage(error)
    replaceTokens(data) // this device stays signed in; the others are signed out
    currentPassword.value = newPassword.value = repeatPassword.value = ''
    return null
  }, 'Your password is changed. Other devices are signed out.')
</script>

<template>
  <AppPage title="Account">
    <div class="screen">
      <h2 class="h5 m-0">Name</h2>
      <FormField v-model="name" label="Name" capitalize="words" autocomplete="name" @enter="saveName" />
      <ErrorText :message="sections.name.value.error" />
      <div v-if="sections.name.value.done" class="fw-semibold">{{ sections.name.value.done }}</div>
      <AppButton :busy="sections.name.value.busy" @click="saveName">Save name</AppButton>

      <h2 class="h5 mt-3 mb-0">Email address</h2>
      <div class="muted">You sign in with {{ email || '…' }}.</div>
      <FormField v-model="newEmail" label="New email address" type="email" inputmode="email" autocomplete="email" />
      <FormField v-model="emailPassword" label="Your current password" type="password" autocomplete="current-password" @enter="changeEmail" />
      <ErrorText :message="sections.email.value.error" />
      <div v-if="sections.email.value.done" class="fw-semibold">{{ sections.email.value.done }}</div>
      <AppButton :busy="sections.email.value.busy" @click="changeEmail">Change email address</AppButton>

      <h2 class="h5 mt-3 mb-0">Password</h2>
      <FormField v-model="currentPassword" label="Current password" type="password" autocomplete="current-password" />
      <FormField v-model="newPassword" label="New password" type="password" autocomplete="new-password" />
      <FormField v-model="repeatPassword" label="New password again" type="password" autocomplete="new-password" @enter="changePassword" />
      <ErrorText :message="sections.password.value.error" />
      <div v-if="sections.password.value.done" class="fw-semibold">{{ sections.password.value.done }}</div>
      <AppButton :busy="sections.password.value.busy" @click="changePassword">Change password</AppButton>
    </div>
  </AppPage>
</template>
