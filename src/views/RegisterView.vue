<script setup lang="ts">
import AppPage from '@/components/AppPage.vue'
import { reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'

import AppButton from '@/components/AppButton.vue'
import ErrorText from '@/components/ErrorText.vue'
import FormField from '@/components/FormField.vue'
import { useAuth } from '@/composables/useAuth'
import { useCodePreview } from '@/composables/useCodePreview'

const { t } = useI18n()
const { register, googleAvailable, signInWithGoogle } = useAuth()
const { preview, check } = useCodePreview()
const route = useRoute()
const form = reactive({ invite_code: typeof route.query.code === 'string' ? route.query.code : '', name: '', email: '', password: '' })
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

// Same rules as the email path: the code decides; a code for a profile a coach keeps asks for confirmation first.
async function submitGoogle() {
  busy.value = true
  error.value = null
  if (!form.invite_code.trim()) {
    error.value = t('auth.google.codeFirst')
    busy.value = false
    return
  }
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
  error.value = (await signInWithGoogle(form.invite_code)).error
  busy.value = false
}

function change() {
  preview.value = null
  error.value = null
}
</script>

<template>
  <AppPage :title="$t('auth.register.title')" back-href="/sign-in">
    <div class="screen">
      <FormField v-model="form.invite_code" :label="$t('auth.register.inviteCode')" capitalize="characters" @update:model-value="change" />
      <i18n-t v-if="preview?.kind === 'claim'" keypath="auth.register.claimNote" tag="div">
        <template #team><b>{{ preview.team_name }}</b></template>
        <template #profile><b>{{ preview.profile_name }}</b></template>
      </i18n-t>
      <FormField v-model="form.name" :label="$t('auth.register.name')" capitalize="words" autocomplete="name" />
      <FormField v-model="form.email" :label="$t('auth.signIn.email')" type="email" inputmode="email" autocomplete="email" />
      <FormField v-model="form.password" :label="$t('auth.signIn.password')" type="password" autocomplete="new-password" @enter="submit" />
      <ErrorText :message="error" />
      <AppButton :busy="busy" @click="submit">
        {{ preview?.kind === 'claim' ? $t('auth.register.createAndLink', { profile: preview.profile_name }) : $t('auth.register.createAccount') }}
      </AppButton>
      <AppButton v-if="googleAvailable" secondary :busy="busy" @click="submitGoogle">{{ $t('auth.google.register') }}</AppButton>
    </div>
  </AppPage>
</template>
