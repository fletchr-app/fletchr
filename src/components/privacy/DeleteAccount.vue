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
    <h2 class="h5 m-0">Delete my account</h2>
    <p class="m-0">
      This erases everything above and also your account: your login, your profile and your membership of every team. You are signed out
      and cannot sign in again. The teams carry on without you, a team you are alone in is deleted, and notes you wrote about other
      archers stay, shown as written by a former coach. Invites you made that nobody has used yet are cancelled.
    </p>
    <p class="m-0">
      If you are the only admin of a team that others belong to, make someone else an admin first (for now in the server's admin
      pages); then you can delete your account. It cannot be undone.
    </p>
    <FormField v-model="password" label="Your password" type="password" autocomplete="current-password" />
    <FormField v-model="confirm" label="Type DELETE ACCOUNT to confirm" capitalize="characters" @enter="erase" />
    <ErrorText :message="result?.error" />
    <AppButton :busy="busy" @click="erase">Delete my account</AppButton>
  </div>
</template>
