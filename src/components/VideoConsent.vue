<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import AppButton from '@/components/AppButton.vue'
import ErrorText from '@/components/ErrorText.vue'
import { useAuth } from '@/composables/useAuth'
import type { components } from '@/lib/api-types'
import { errorMessage } from '@/lib/errors'

type Archer = components['schemas']['Archer']

// For an archer under 18 a coach records that the parents agreed to video. Without it no video of the archer is added.
const props = defineProps<{ archer: Archer }>()
const emit = defineEmits<{ changed: [] }>()
const { t } = useI18n()
const { api } = useAuth()
const busy = ref(false)
const error = ref<string | null>(null)

const given = computed(() => !!props.archer.video_consent_at)
const status = computed(() =>
  given.value
    ? t('consent.given', { who: props.archer.video_consent_by ?? '', date: new Date(props.archer.video_consent_at!).toLocaleDateString() })
    : t('consent.missing', { name: props.archer.name }),
)

async function change() {
  busy.value = true
  error.value = null
  try {
    const path = { params: { path: { user_id: props.archer.id } } }
    const { response, error: failure } = given.value ? await api.DELETE('/api/archers/{user_id}/video-consent/', path) : await api.PUT('/api/archers/{user_id}/video-consent/', path)
    if (response.ok) emit('changed')
    else error.value = errorMessage(failure)
  } catch {
    error.value = t('common.serverNotReachable')
  }
  busy.value = false
}
</script>

<template>
  <div class="d-flex flex-column gap-2">
    <div class="fw-semibold">{{ $t('consent.title') }}</div>
    <div class="muted">{{ status }}</div>
    <ErrorText :message="error" />
    <AppButton secondary :busy="busy" @click="change">{{ given ? $t('consent.withdraw') : $t('consent.record') }}</AppButton>
  </div>
</template>
