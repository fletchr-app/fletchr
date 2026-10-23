<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import AppPage from '@/components/AppPage.vue'
import ChipGroup from '@/components/ChipGroup.vue'
import { type ThemeMode, useTheme } from '@/composables/useTheme'

// Light, dark, or whatever the phone is set to.
const { t } = useI18n()
const { mode, setMode } = useTheme()
const THEMES = computed<{ value: ThemeMode; label: string }[]>(() => [
  { value: 'system', label: t('settings.themeSystem') },
  { value: 'light', label: t('settings.themeLight') },
  { value: 'dark', label: t('settings.themeDark') },
])
</script>

<template>
  <AppPage :title="$t('settings.theme')" back-href="/settings">
    <div class="screen">
      <ChipGroup :model-value="mode" :label="$t('settings.theme')" :options="THEMES" @update:model-value="setMode" />
    </div>
  </AppPage>
</template>
