<script setup lang="ts">
import { ref } from 'vue'

import AppButton from '@/components/AppButton.vue'
import ErrorText from '@/components/ErrorText.vue'
import FormField from '@/components/FormField.vue'
import { useLog } from '@/composables/useLog'

const { deleteMyAccount } = useLog()
const password = ref('')
const confirm = ref('')
const busy = ref(false)
const result = ref<{ error: string; teams: string[] } | null>(null)

async function erase() {
  busy.value = true
  result.value = null
  // On success you are signed out and this screen disappears.
  result.value = await deleteMyAccount(password.value, confirm.value)
  busy.value = false
}
</script>

<template>
  <div class="d-flex flex-column gap-3 mt-4">
    <h2 class="h5 m-0">{{ $t('privacy.deleteAccountTitle') }}</h2>
    <p class="m-0">{{ $t('privacy.deleteAccountText1') }}</p>
    <p class="m-0">{{ $t('privacy.deleteAccountText2') }}</p>
    <FormField v-model="password" :label="$t('privacy.password')" type="password" autocomplete="current-password" />
    <FormField v-model="confirm" :label="$t('privacy.typeDeleteAccount')" capitalize="characters" @enter="erase" />
    <ErrorText :message="result?.error" />
    <AppButton :busy="busy" @click="erase">{{ $t('privacy.deleteAccount') }}</AppButton>
  </div>
</template>
