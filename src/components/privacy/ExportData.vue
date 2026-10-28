<script setup lang="ts">
import { Browser } from '@capacitor/browser'
import { Capacitor } from '@capacitor/core'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

import AppButton from '@/components/AppButton.vue'
import ErrorText from '@/components/ErrorText.vue'
import FormField from '@/components/FormField.vue'
import { useProof } from '@/composables/useProof'
import { useAuth } from '@/composables/useAuth'
import { errorMessage } from '@/lib/errors'
import { saveJson } from '@/lib/export-file'

const { t } = useI18n()
const { api } = useAuth()
const { hasPassword, proof } = useProof()
const password = ref('')
const busy = ref(false)
const error = ref<string | null>(null)
const done = ref(false)
const mediaBusy = ref(false)
const mediaNote = ref<string | null>(null)

async function download() {
  busy.value = true
  error.value = null
  done.value = false
  try {
    const body = await proof(password.value)
    if (!body) {
      busy.value = false
      return // cancelled the Google chooser
    }
    const { data, error: failure } = await api.POST('/api/me/export/', { body })
    if (!data) error.value = errorMessage(failure)
    else {
      await saveJson(`fletchr-data-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2))
      password.value = ''
      done.value = true
    }
  } catch (e) {
    error.value = e instanceof Error && e.message.startsWith('Sharing') ? t('privacy.sharingUnavailable') : t('privacy.exportFailed')
  }
  busy.value = false
}

// The files can be many megabytes, so the browser of the phone fetches the zip from a link that works for ten minutes.
async function downloadMedia() {
  mediaBusy.value = true
  error.value = null
  mediaNote.value = null
  try {
    const body = await proof(password.value)
    if (!body) {
      mediaBusy.value = false
      return // cancelled the Google chooser
    }
    const { data, error: failure } = await api.POST('/api/me/export/media/', { body })
    if (!data) error.value = errorMessage(failure)
    else if (data.files === 0) mediaNote.value = t('privacy.noMedia')
    else {
      if (Capacitor.isNativePlatform()) await Browser.open({ url: data.url })
      else window.location.assign(data.url)
      password.value = ''
      mediaNote.value = t('privacy.mediaStarted', { n: data.files, mb: Math.max(1, Math.round(data.bytes / 1024 / 1024)) })
    }
  } catch {
    error.value = t('privacy.exportFailed')
  }
  mediaBusy.value = false
}
</script>

<template>
  <div class="d-flex flex-column gap-3">
    <h2 class="h5 m-0">{{ $t('privacy.exportTitle') }}</h2>
    <p class="m-0">{{ $t('privacy.exportText') }}</p>
    <FormField v-if="hasPassword" v-model="password" :label="$t('privacy.password')" type="password" autocomplete="current-password" @enter="download" />
    <p v-else class="m-0">{{ $t('privacy.googleProof') }}</p>
    <ErrorText :message="error" />
    <div v-if="done" class="fw-semibold">{{ $t('privacy.exported') }}</div>
    <AppButton :busy="busy" @click="download">{{ $t('privacy.exportButton') }}</AppButton>
    <p class="m-0">{{ $t('privacy.exportMediaText') }}</p>
    <div v-if="mediaNote" class="fw-semibold">{{ mediaNote }}</div>
    <AppButton :busy="mediaBusy" secondary @click="downloadMedia">{{ $t('privacy.exportMediaButton') }}</AppButton>
  </div>
</template>
