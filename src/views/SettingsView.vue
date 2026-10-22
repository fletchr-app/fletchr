<script setup lang="ts">
import { ref } from 'vue'

import AppButton from '@/components/AppButton.vue'
import ChipGroup from '@/components/ChipGroup.vue'
import FormField from '@/components/FormField.vue'
import { DEFAULT_SERVER_URL, useServer, useServerHealth } from '@/composables/useServer'
import { type ThemeMode, useTheme } from '@/composables/useTheme'

const { url, isOverride, setUrl } = useServer()
const health = useServerHealth()
const draft = ref(url.value)
const { mode, setMode } = useTheme()
const THEMES: { value: ThemeMode; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

function reset() {
  setUrl(null)
  draft.value = DEFAULT_SERVER_URL
}
</script>

<template>
  <div class="screen">
    <ChipGroup :model-value="mode" label="Theme" :options="THEMES" @update:model-value="setMode" />
    <FormField v-model="draft" label="Server address" inputmode="url" :placeholder="DEFAULT_SERVER_URL" />
    <div class="muted">Default from build: {{ DEFAULT_SERVER_URL }}{{ isOverride ? ' (overridden on this device)' : '' }}</div>
    <div>Status: {{ health }}</div>
    <div class="d-flex gap-3">
      <AppButton @click="setUrl(draft)">Save</AppButton>
      <AppButton secondary @click="reset">Reset to default</AppButton>
    </div>
  </div>
</template>
