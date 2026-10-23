<script setup lang="ts">
import { onIonViewWillEnter } from '@ionic/vue'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import AppButton from '@/components/AppButton.vue'
import AppPage from '@/components/AppPage.vue'
import ChipGroup from '@/components/ChipGroup.vue'
import ErrorText from '@/components/ErrorText.vue'
import FormField from '@/components/FormField.vue'
import { useAuth } from '@/composables/useAuth'
import { useUnits } from '@/composables/useUnits'
import { emailFormError, passwordFormError } from '@/lib/account'
import { errorMessage } from '@/lib/errors'
import { isUnits, type Units } from '@/lib/units'

// Name, email address (the login) and password of the account. Email and password need the current password.
const { t } = useI18n()
const { api, replaceTokens } = useAuth()

const email = ref('')
const name = ref('')
const hand = ref('')
const eye = ref('')
const birth = ref('')
const unitsChoice = ref<Units>('metric')
const { setUnits } = useUnits()
const HANDS = computed(() => [{ value: '', label: t('account.notSet') }, { value: 'right', label: t('account.right') }, { value: 'left', label: t('account.left') }])
const UNITS = computed<{ value: Units; label: string }[]>(() => [{ value: 'metric', label: t('account.metric') }, { value: 'imperial', label: t('account.imperial') }])

onIonViewWillEnter(async () => {
  try {
    const { data } = await api.GET('/api/me/')
    if (data) {
      email.value = data.email
      name.value = data.profile.name ?? ''
      hand.value = data.profile.dominant_hand ?? ''
      eye.value = data.profile.dominant_eye ?? ''
      birth.value = data.profile.date_of_birth ?? ''
      unitsChoice.value = isUnits(data.profile.units) ? data.profile.units : 'metric'
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
    state.value = { busy: false, error: t('common.serverNotReachable'), done: null }
  }
}

const saveProfile = () =>
  run('name', async () => {
    const { data, error } = await api.PATCH('/api/me/', {
      body: {
        profile: {
          name: name.value.trim(),
          dominant_hand: hand.value as '' | 'right' | 'left',
          dominant_eye: eye.value as '' | 'right' | 'left',
          date_of_birth: birth.value || null,
          units: unitsChoice.value,
        },
      },
    })
    if (!data) return errorMessage(error)
    name.value = data.profile.name ?? ''
    setUnits(unitsChoice.value)
    return null
  }, t('account.saved'))

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
    <div class="screen">
      <h2 class="h5 m-0">{{ $t('account.profile') }}</h2>
      <FormField v-model="name" :label="$t('account.name')" capitalize="words" autocomplete="name" />
      <ChipGroup v-model="hand" :label="$t('account.hand')" :options="HANDS" />
      <ChipGroup v-model="eye" :label="$t('account.eye')" :options="HANDS" />
      <FormField v-model="birth" :label="$t('account.birth')" type="date" />
      <div class="faint">{{ $t('account.birthHint') }}</div>
      <ChipGroup v-model="unitsChoice" :label="$t('account.units')" :options="UNITS" />
      <ErrorText :message="sections.name.value.error" />
      <div v-if="sections.name.value.done" class="fw-semibold">{{ sections.name.value.done }}</div>
      <AppButton :busy="sections.name.value.busy" @click="saveProfile">{{ $t('account.saveProfile') }}</AppButton>

      <h2 class="h5 mt-3 mb-0">{{ $t('account.email') }}</h2>
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
