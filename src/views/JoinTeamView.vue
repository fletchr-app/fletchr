<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'

import AppButton from '@/components/AppButton.vue'
import ErrorText from '@/components/ErrorText.vue'
import FormField from '@/components/FormField.vue'
import { useAuth } from '@/composables/useAuth'
import { errorMessage } from '@/lib/errors'

const router = useRouter()
const { api } = useAuth()
const code = ref('')
const error = ref<string | null>(null)
const busy = ref(false)

async function submit() {
  busy.value = true
  error.value = null
  try {
    const { data, error: failure } = await api.POST('/api/invites/redeem/', { body: { invite_code: code.value.trim() } })
    if (data) void router.replace('/')
    else error.value = errorMessage(failure)
  } catch {
    error.value = 'Server not reachable'
  }
  busy.value = false
}
</script>

<template>
  <div class="screen">
    <FormField v-model="code" label="Invite code" capitalize="characters" @enter="submit" />
    <ErrorText :message="error" />
    <AppButton :busy="busy" @click="submit">Join team</AppButton>
  </div>
</template>
