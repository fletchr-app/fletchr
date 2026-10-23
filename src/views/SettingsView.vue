<script setup lang="ts">
import { IonItem, IonLabel, IonList, IonListHeader } from '@ionic/vue'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import AppButton from '@/components/AppButton.vue'
import AppPage from '@/components/AppPage.vue'
import ChipGroup from '@/components/ChipGroup.vue'
import ErrorText from '@/components/ErrorText.vue'
import FormField from '@/components/FormField.vue'
import { useAuth } from '@/composables/useAuth'
import { useCreateTeam } from '@/composables/useCreateTeam'
import { type LanguageMode, useLocale } from '@/composables/useLocale'
import { DEFAULT_SERVER_URL, useServer, useServerHealth } from '@/composables/useServer'
import { type ThemeMode, useTheme } from '@/composables/useTheme'

// The tab for everything that is not training: equipment, teams, account and data, and how the app looks and
// where it connects. Signed out (from the sign-in screen's "change" link) only the app part is shown.
const { status, signOut } = useAuth()
const signedIn = computed(() => status.value === 'signedIn')
const creating = useCreateTeam()

const { url, isOverride, setUrl } = useServer()
const health = useServerHealth()
const draft = ref(url.value)
const { t } = useI18n()
const { mode, setMode } = useTheme()
const THEMES = computed<{ value: ThemeMode; label: string }[]>(() => [
  { value: 'system', label: t('settings.themeSystem') },
  { value: 'light', label: t('settings.themeLight') },
  { value: 'dark', label: t('settings.themeDark') },
])
const { mode: languageMode, setMode: setLanguage } = useLocale()
const LANGUAGES = computed<{ value: LanguageMode; label: string }[]>(() => [
  { value: 'system', label: t('settings.langSystem') },
  { value: 'en', label: t('settings.langEn') },
  { value: 'de', label: t('settings.langDe') },
])

function reset() {
  setUrl(null)
  draft.value = DEFAULT_SERVER_URL
}
</script>

<template>
  <AppPage :title="$t('settings.title')" :back="!signedIn" back-href="/sign-in">
    <div class="screen">
      <template v-if="signedIn">
        <IonList inset>
          <IonListHeader>{{ $t('settings.training') }}</IonListHeader>
          <IonItem router-link="/equipment" detail lines="none"><IonLabel>{{ $t('settings.equipment') }}</IonLabel></IonItem>
        </IonList>
        <IonList inset>
          <IonListHeader>{{ $t('settings.teams') }}</IonListHeader>
          <IonItem router-link="/join-team" detail lines="full"><IonLabel>{{ $t('settings.joinTeam') }}</IonLabel></IonItem>
          <IonItem button detail lines="none" @click="creating.ask"><IonLabel>{{ $t('settings.createTeam') }}</IonLabel></IonItem>
        </IonList>
        <ErrorText :message="creating.error.value" />
        <IonList inset>
          <IonListHeader>{{ $t('settings.account') }}</IonListHeader>
          <IonItem router-link="/account" detail lines="full"><IonLabel>{{ $t('settings.accountRow') }}</IonLabel></IonItem>
          <IonItem router-link="/privacy" detail lines="none"><IonLabel>{{ $t('settings.yourData') }}</IonLabel></IonItem>
        </IonList>
      </template>

      <h2 class="h5 mt-2 mb-0">{{ $t('settings.app') }}</h2>
      <ChipGroup :model-value="mode" :label="$t('settings.theme')" :options="THEMES" @update:model-value="setMode" />
      <ChipGroup :model-value="languageMode" :label="$t('settings.language')" :options="LANGUAGES" @update:model-value="setLanguage" />
      <FormField v-model="draft" :label="$t('settings.server')" inputmode="url" :placeholder="DEFAULT_SERVER_URL" />
      <div class="muted">{{ $t('settings.defaultFromBuild', { url: DEFAULT_SERVER_URL }) }}{{ isOverride ? ` ${$t('settings.overridden')}` : '' }}</div>
      <div>{{ $t('settings.status', { state: $t(`settings.${health}`) }) }}</div>
      <div class="d-flex gap-3">
        <AppButton @click="setUrl(draft)">{{ $t('settings.save') }}</AppButton>
        <AppButton secondary @click="reset">{{ $t('settings.reset') }}</AppButton>
      </div>

      <AppButton v-if="signedIn" class="mt-3" secondary @click="signOut">{{ $t('settings.signOut') }}</AppButton>
    </div>
  </AppPage>
</template>
