<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import AppButton from '@/components/AppButton.vue'
import AppPage from '@/components/AppPage.vue'
import ChipGroup from '@/components/ChipGroup.vue'
import ErrorText from '@/components/ErrorText.vue'
import FormField from '@/components/FormField.vue'
import { useAuth } from '@/composables/useAuth'
import { useRemote } from '@/composables/useRemote'
import { errorMessage } from '@/lib/errors'

// A coach fills in dominant hand and eye and the date of birth of an archer who has no account.
// Archers with an account fill these in themselves (Settings, Account).
const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const { api } = useAuth()
const id = Number(route.params.id)

const hand = ref('')
const eye = ref('')
const birth = ref('')
const error = ref<string | null>(null)
const busy = ref(false)
const HANDS = computed(() => [{ value: '', label: t('account.notSet') }, { value: 'right', label: t('account.right') }, { value: 'left', label: t('account.left') }])

const info = useRemote(async () => {
  const data = (await api.GET('/api/archers/{user_id}/', { params: { path: { user_id: id } } })).data ?? null
  if (data) {
    hand.value = data.dominant_hand
    eye.value = data.dominant_eye
    birth.value = data.date_of_birth ?? ''
  }
  return data
})

async function save() {
  const teamId = info.data.value?.team_id
  if (!teamId) return
  busy.value = true
  error.value = null
  try {
    const { data, error: failure } = await api.PATCH('/api/teams/{team_id}/archers/{user_id}/', {
      params: { path: { team_id: teamId, user_id: id } },
      body: { dominant_hand: hand.value as '' | 'right' | 'left', dominant_eye: eye.value as '' | 'right' | 'left', date_of_birth: birth.value || null },
    })
    if (data) router.back()
    else error.value = errorMessage(failure)
  } catch {
    error.value = t('common.serverNotReachable')
  }
  busy.value = false
}
</script>

<template>
  <AppPage :title="$t('archer.detailsTitle')">
    <div class="screen">
      <ErrorText :message="info.error.value" />
      <div v-if="info.loading.value">{{ $t('common.loading') }}</div>
      <template v-else-if="info.data.value">
        <h2 class="h5 m-0">{{ info.data.value.name }}</h2>
        <ChipGroup v-model="hand" :label="$t('account.hand')" :options="HANDS" />
        <ChipGroup v-model="eye" :label="$t('account.eye')" :options="HANDS" />
        <FormField v-model="birth" :label="$t('account.birth')" type="date" />
        <div class="faint">{{ $t('archer.birthHint') }}</div>
        <ErrorText :message="error" />
        <AppButton :busy="busy" @click="save">{{ $t('common.save') }}</AppButton>
      </template>
    </div>
  </AppPage>
</template>
