<script setup lang="ts">
import { ref } from 'vue'

import AppButton from '@/components/AppButton.vue'
import ErrorText from '@/components/ErrorText.vue'
import FormField from '@/components/FormField.vue'
import { useAuth } from '@/composables/useAuth'
import { errorMessage } from '@/lib/errors'
import { saveJson } from '@/lib/export-file'

const { api } = useAuth()
const password = ref('')
const busy = ref(false)
const error = ref<string | null>(null)
const done = ref(false)

async function download() {
  busy.value = true
  error.value = null
  done.value = false
  try {
    const { data, error: failure } = await api.POST('/api/me/export/', { body: { password: password.value } })
    if (!data) error.value = errorMessage(failure)
    else {
      await saveJson(`archery-coach-data-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2))
      password.value = ''
      done.value = true
    }
  } catch (e) {
    error.value = e instanceof Error && e.message.startsWith('Sharing') ? e.message : 'Could not get your data. Is the server reachable?'
  }
  busy.value = false
}
</script>

<template>
  <div class="d-flex flex-column gap-3">
    <h2 class="h5 m-0">Download my data</h2>
    <p class="m-0">
      One file (JSON) with everything the server has about you: your profile and teams, your equipment with its history, all your
      sessions with every arrow, and the coach notes about you, including the ones that were not shared with you, and the notes you
      wrote yourself.
    </p>
    <FormField v-model="password" label="Your password" type="password" autocomplete="current-password" @enter="download" />
    <ErrorText :message="error" />
    <div v-if="done" class="fw-semibold">Your data was exported.</div>
    <AppButton :busy="busy" @click="download">Download my data</AppButton>
  </div>
</template>
