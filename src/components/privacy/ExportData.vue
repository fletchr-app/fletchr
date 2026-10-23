<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

import AppButton from '@/components/AppButton.vue'
import ErrorText from '@/components/ErrorText.vue'
import FormField from '@/components/FormField.vue'
import { useAuth } from '@/composables/useAuth'
import { errorMessage } from '@/lib/errors'
import { saveJson } from '@/lib/export-file'

const { t } = useI18n()
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
      await saveJson(`fletchr-data-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2))
      password.value = ''
      done.value = true
    }
  } catch (e) {
    error.value = e instanceof Error && e.message.startsWith('Sharing') ? t('privacy.sharingUnavailable') : t('privacy.exportFailed')
  }
  busy.value = false
}
</script>

<template>
  <div class="d-flex flex-column gap-3">
    <h2 class="h5 m-0">{{ $t('privacy.exportTitle') }}</h2>
    <p class="m-0">{{ $t('privacy.exportText') }}</p>
    <FormField v-model="password" :label="$t('privacy.password')" type="password" autocomplete="current-password" @enter="download" />
    <ErrorText :message="error" />
    <div v-if="done" class="fw-semibold">{{ $t('privacy.exported') }}</div>
    <AppButton :busy="busy" @click="download">{{ $t('privacy.exportButton') }}</AppButton>
  </div>
</template>
