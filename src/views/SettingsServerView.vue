<script setup lang="ts">
import { computed, ref } from 'vue'

import AppButton from '@/components/AppButton.vue'
import AppPage from '@/components/AppPage.vue'
import FormField from '@/components/FormField.vue'
import { useAuth } from '@/composables/useAuth'
import { DEFAULT_SERVER_URL, useServer, useServerHealth } from '@/composables/useServer'

// Which server the app talks to. Also reachable before signing in (the "change" link on the sign-in screen).
const { status } = useAuth()
const signedIn = computed(() => status.value === 'signedIn')
const { url, isOverride, setUrl } = useServer()
const health = useServerHealth()
const draft = ref(url.value)

function reset() {
  setUrl(null)
  draft.value = DEFAULT_SERVER_URL
}
</script>

<template>
  <AppPage :title="$t('settings.server')" :back-href="signedIn ? '/settings' : '/sign-in'">
    <div class="screen">
      <FormField v-model="draft" :label="$t('settings.server')" inputmode="url" :placeholder="DEFAULT_SERVER_URL" />
      <div class="muted">{{ $t('settings.defaultFromBuild', { url: DEFAULT_SERVER_URL }) }}{{ isOverride ? ` ${$t('settings.overridden')}` : '' }}</div>
      <div>{{ $t('settings.status', { state: $t(`settings.${health}`) }) }}</div>
      <div class="d-flex gap-3">
        <AppButton @click="setUrl(draft)">{{ $t('settings.save') }}</AppButton>
        <AppButton secondary @click="reset">{{ $t('settings.reset') }}</AppButton>
      </div>
    </div>
  </AppPage>
</template>
