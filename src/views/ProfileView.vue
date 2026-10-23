<script setup lang="ts">
import { onIonViewWillEnter } from '@ionic/vue'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import AppButton from '@/components/AppButton.vue'
import AppPage from '@/components/AppPage.vue'
import ChipGroup from '@/components/ChipGroup.vue'
import ErrorText from '@/components/ErrorText.vue'
import FormField from '@/components/FormField.vue'
import { useAuth } from '@/composables/useAuth'
import { errorMessage } from '@/lib/errors'

// Who you are as an archer: name, dominant hand and eye, date of birth. Coaches of your teams see the name, hand, eye and age.
const { t } = useI18n()
const { api } = useAuth()

const name = ref('')
const hand = ref('')
const eye = ref('')
const birth = ref('')
const busy = ref(false)
const error = ref<string | null>(null)
const done = ref(false)
const SIDES = computed(() => [{ value: '', label: t('account.notSet') }, { value: 'right', label: t('account.right') }, { value: 'left', label: t('account.left') }])

onIonViewWillEnter(async () => {
  done.value = false
  try {
    const { data } = await api.GET('/api/me/')
    if (data) {
      name.value = data.profile.name ?? ''
      hand.value = data.profile.dominant_hand ?? ''
      eye.value = data.profile.dominant_eye ?? ''
      birth.value = data.profile.date_of_birth ?? ''
    }
  } catch {
    // Offline: the form stays empty.
  }
})

async function save() {
  busy.value = true
  error.value = null
  done.value = false
  try {
    const { data, error: failure } = await api.PATCH('/api/me/', {
      body: {
        profile: {
          name: name.value.trim(),
          dominant_hand: hand.value as '' | 'right' | 'left',
          dominant_eye: eye.value as '' | 'right' | 'left',
          date_of_birth: birth.value || null,
        },
      },
    })
    if (data) {
      name.value = data.profile.name ?? ''
      done.value = true
    } else error.value = errorMessage(failure)
  } catch {
    error.value = t('common.serverNotReachable')
  }
  busy.value = false
}
</script>

<template>
  <AppPage :title="$t('profile.title')">
    <div class="screen">
      <FormField v-model="name" :label="$t('account.name')" capitalize="words" autocomplete="name" />
      <ChipGroup v-model="hand" :label="$t('account.hand')" :options="SIDES" />
      <ChipGroup v-model="eye" :label="$t('account.eye')" :options="SIDES" />
      <FormField v-model="birth" :label="$t('account.birth')" type="date" />
      <div class="faint">{{ $t('account.birthHint') }}</div>
      <ErrorText :message="error" />
      <div v-if="done" class="fw-semibold">{{ $t('account.saved') }}</div>
      <AppButton :busy="busy" @click="save">{{ $t('account.saveProfile') }}</AppButton>
    </div>
  </AppPage>
</template>
