<script setup lang="ts">
import { onIonViewWillEnter } from '@ionic/vue'
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'

import AppButton from '@/components/AppButton.vue'
import AppPage from '@/components/AppPage.vue'
import ErrorText from '@/components/ErrorText.vue'
import FormField from '@/components/FormField.vue'
import { pendingResetCode } from '@/composables/useAppLinks'
import { useAuth } from '@/composables/useAuth'
import { useServer } from '@/composables/useServer'
import { newPasswordError } from '@/lib/account'
import { errorMessage } from '@/lib/errors'
import { packPendingReset, unpackPendingReset } from '@/lib/pending-reset'
import { t } from '@/i18n'

// Forgotten password, in two steps on one screen: the email address gets a code, then the code and a new password
// are sent together. Afterwards the person is signed in with the new password.
// `custom`: reached from the custom server sign-in, which has already set the server. Otherwise this is the official server.
const props = defineProps<{ custom?: boolean }>()
const { api, signIn, switchServer } = useAuth()
const { url } = useServer()
onIonViewWillEnter(() => {
  if (!props.custom) void switchServer(null)
})
const email = ref('')
const code = ref('')
const password = ref('')
const repeat = ref('')
const sent = ref(false)
const error = ref<string | null>(null)
const busy = ref(false)
const address = computed(() => email.value.trim())

// The link in the mail carries only the code. The address is the one the code was sent to, kept on the device for the hour it works.
const PENDING_KEY = 'pendingReset'
const savedAddress = () => {
  try {
    return unpackPendingReset(localStorage.getItem(PENDING_KEY), Date.now())
  } catch {
    return null
  }
}
const keepAddress = (value: string | null) => {
  try {
    if (value) localStorage.setItem(PENDING_KEY, packPendingReset(value, Date.now()))
    else localStorage.removeItem(PENDING_KEY)
  } catch {
    // Storage is blocked: the person types the address again.
  }
}
const fromLink = ref(false)
const askAddress = ref(false) // the code came by link but this device does not know the address
// A reset link opened the app: go straight to the second step with the code filled in. The screen stays alive in the
// background, so this is a watch on a module-level value and not the route.
watch(
  pendingResetCode,
  (linked) => {
    if (!linked || props.custom) return
    code.value = linked
    pendingResetCode.value = null
    const known = savedAddress()
    if (known) email.value = known
    askAddress.value = !known && !address.value
    fromLink.value = true
    sent.value = true
    error.value = null
  },
  { immediate: true },
)

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
    if (response.ok) {
      sent.value = true
      fromLink.value = false
      askAddress.value = false
      keepAddress(address.value)
    }
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
    keepAddress(null)
    error.value = await signIn(address.value, password.value) // signed in: the app moves on to Home
  })
</script>

<template>
  <AppPage :title="$t('auth.reset.title')" :back-href="custom ? '/sign-in/custom' : '/sign-in'">
    <div class="screen">
      <div v-if="custom" class="muted">{{ $t('auth.signIn.server', { url }) }}</div>
      <template v-if="!sent">
        <div>{{ $t('auth.reset.intro') }}</div>
        <div class="muted">{{ $t('auth.reset.google') }}</div>
        <FormField v-model="email" :label="$t('auth.signIn.email')" type="email" inputmode="email" autocomplete="email" @enter="sendCode" />
        <ErrorText :message="error" />
        <AppButton :busy="busy" @click="sendCode">{{ $t('auth.reset.sendCode') }}</AppButton>
        <RouterLink :to="custom ? '/sign-in/custom' : '/sign-in'">{{ $t('auth.reset.backToSignIn') }}</RouterLink>
      </template>
      <template v-else>
        <div v-if="fromLink">{{ $t('auth.reset.fromLink') }}</div>
        <div v-else>{{ $t('auth.reset.sent', { email: address }) }}</div>
        <FormField v-if="askAddress" v-model="email" :label="$t('auth.signIn.email')" type="email" inputmode="email" autocomplete="email" />
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
