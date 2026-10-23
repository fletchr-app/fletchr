<script setup lang="ts">
import AppPage from '@/components/AppPage.vue'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import AppButton from '@/components/AppButton.vue'
import ErrorText from '@/components/ErrorText.vue'
import FormField from '@/components/FormField.vue'
import { useAuth } from '@/composables/useAuth'
import { useCodePreview } from '@/composables/useCodePreview'
import { useTeams } from '@/composables/useTeams'
import { errorMessage } from '@/lib/errors'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const { api } = useAuth()
const { preview, check } = useCodePreview()
const { load } = useTeams()
// With an invite link the code is filled in and what it does is shown first: nothing is joined until you tap.
const code = ref(typeof route.query.code === 'string' ? route.query.code : '')
const error = ref<string | null>(null)
const busy = ref(false)

// An invite joins at once. A code for a profile a coach keeps asks for confirmation first.
async function submit() {
  busy.value = true
  error.value = null
  const found = await check(code.value)
  if ('error' in found) error.value = found.error
  else if (found.preview.kind === 'invite') await redeem('/api/invites/redeem/')
  busy.value = false
}

async function redeem(path: '/api/invites/redeem/' | '/api/claims/redeem/') {
  busy.value = true
  error.value = null
  try {
    const { data, error: failure } = await api.POST(path, { body: { invite_code: code.value.trim() } })
    if (data) {
      await load()
      void router.replace('/')
    }
    else error.value = errorMessage(failure)
  } catch {
    error.value = t('common.serverNotReachable')
  }
  busy.value = false
}

if (code.value) {
  void check(code.value).then((found) => {
    if ('error' in found) error.value = found.error
  })
}

function change() {
  preview.value = null
  error.value = null
}
</script>

<template>
  <AppPage :title="$t('auth.join.title')">
    <div class="screen">
      <FormField v-model="code" :label="$t('auth.join.inviteCode')" capitalize="characters" @update:model-value="change" @enter="submit" />
      <template v-if="preview?.kind === 'claim'">
        <i18n-t keypath="auth.join.claimNote" tag="div">
          <template #team><b>{{ preview.team_name }}</b></template>
          <template #profile><b>{{ preview.profile_name }}</b></template>
        </i18n-t>
        <ErrorText :message="error" />
        <AppButton :busy="busy" @click="redeem('/api/claims/redeem/')">{{ $t('auth.join.link', { profile: preview.profile_name }) }}</AppButton>
        <AppButton secondary @click="change">{{ $t('common.cancel') }}</AppButton>
      </template>
      <template v-else-if="preview?.kind === 'invite'">
        <i18n-t keypath="auth.join.invited" tag="div">
          <template #team><b>{{ preview.team_name }}</b></template>
        </i18n-t>
        <ErrorText :message="error" />
        <AppButton :busy="busy" @click="redeem('/api/invites/redeem/')">{{ $t('auth.join.joinNamed', { team: preview.team_name }) }}</AppButton>
        <AppButton secondary @click="change">{{ $t('common.cancel') }}</AppButton>
      </template>
      <template v-else>
        <ErrorText :message="error" />
        <AppButton :busy="busy" @click="submit">{{ $t('auth.join.join') }}</AppButton>
      </template>
    </div>
  </AppPage>
</template>
