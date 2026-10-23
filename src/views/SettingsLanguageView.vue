<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import AppPage from '@/components/AppPage.vue'
import ChipGroup from '@/components/ChipGroup.vue'
import { type LanguageMode, useLocale } from '@/composables/useLocale'

// English, German, or the phone's language.
const { t } = useI18n()
const { mode, setMode } = useLocale()
const LANGUAGES = computed<{ value: LanguageMode; label: string }[]>(() => [
  { value: 'system', label: t('settings.langSystem') },
  { value: 'en', label: t('settings.langEn') },
  { value: 'de', label: t('settings.langDe') },
])
</script>

<template>
  <AppPage :title="$t('settings.language')" back-href="/settings">
    <div class="screen">
      <ChipGroup :model-value="mode" :label="$t('settings.language')" :options="LANGUAGES" @update:model-value="setMode" />
    </div>
  </AppPage>
</template>
