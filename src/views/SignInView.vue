<script setup lang="ts">
import AppPage from '@/components/AppPage.vue'
import { ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'

import AppButton from '@/components/AppButton.vue'
import BrandMark from '@/components/BrandMark.vue'
import ErrorText from '@/components/ErrorText.vue'
import FormField from '@/components/FormField.vue'
import { useAuth } from '@/composables/useAuth'
import { useServer } from '@/composables/useServer'

const { signIn, googleAvailable, signInWithGoogle, enterLocal, isLocal } = useAuth()
const router = useRouter()
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

async function useLocal() {
  await enterLocal()
  void router.replace('/')
}

async function google() {
  busy.value = true
  error.value = (await signInWithGoogle()).error
  busy.value = false
}
</script>

<template>
  <AppPage :title="$t('auth.signIn.title')" :back="false" :mark="false">
    <div class="screen">
      <BrandMark :size="88" class="align-self-center mt-3" />
      <FormField v-model="email" :label="$t('auth.signIn.email')" type="email" inputmode="email" autocomplete="email" />
      <FormField v-model="password" :label="$t('auth.signIn.password')" type="password" autocomplete="current-password" @enter="submit" />
      <ErrorText :message="error" />
      <AppButton :busy="busy" @click="submit">{{ $t('auth.signIn.button') }}</AppButton>
      <AppButton v-if="googleAvailable" secondary :busy="busy" @click="google">{{ $t('auth.google.signIn') }}</AppButton>
      <RouterLink to="/reset-password">{{ $t('auth.signIn.forgot') }}</RouterLink>
      <RouterLink to="/register">{{ $t('auth.signIn.haveInvite') }}</RouterLink>
      <div class="d-flex flex-column gap-2 pt-3 border-top">
        <div class="fw-semibold">{{ $t('local.useWithout') }}</div>
        <div class="muted">{{ isLocal ? $t('local.signInText') : $t('local.useWithoutText') }}</div>
        <AppButton v-if="isLocal" secondary router-link="/">{{ $t('local.backToApp') }}</AppButton>
        <AppButton v-else secondary @click="useLocal">{{ $t('local.useWithoutButton') }}</AppButton>
      </div>
      <div class="muted">{{ $t('auth.signIn.server', { url }) }} <RouterLink to="/settings/server">{{ $t('auth.signIn.change') }}</RouterLink></div>
    </div>
  </AppPage>
</template>
