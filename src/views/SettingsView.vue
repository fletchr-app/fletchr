<script setup lang="ts">
import { IonItem, IonLabel, IonList, IonListHeader, IonNote, IonSelect, IonSelectOption } from '@ionic/vue'
import { computed } from 'vue'

import AppButton from '@/components/AppButton.vue'
import AppPage from '@/components/AppPage.vue'
import ErrorText from '@/components/ErrorText.vue'
import { useAuth } from '@/composables/useAuth'
import { useCreateTeam } from '@/composables/useCreateTeam'
import { type LanguageMode, useLocale } from '@/composables/useLocale'
import { useServer } from '@/composables/useServer'
import { type ThemeMode, useTheme } from '@/composables/useTheme'
import { useUnits } from '@/composables/useUnits'
import { useUploadSettings } from '@/composables/useUploadSettings'
import type { Units } from '@/lib/units'

// The tab for everything that is not training: equipment, teams, account and data, and how the app looks and
// where it connects. Theme and language are picked in a sheet; the server address has its own page.
const { signOut } = useAuth()
const APP_VERSION = __APP_VERSION__
const creating = useCreateTeam()
const { mode: theme, setMode: setTheme } = useTheme()
const { mode: language, setMode: setLanguage } = useLocale()
const { url } = useServer()
const { units, saveUnits } = useUnits()
const UNITS: Units[] = ['metric', 'imperial']
const { videosWifiOnly, setVideosWifiOnly } = useUploadSettings()

const THEMES: ThemeMode[] = ['system', 'light', 'dark']
const LANGUAGES: { value: LanguageMode; key: string }[] = [
  { value: 'system', key: 'langSystem' },
  { value: 'en', key: 'langEn' },
  { value: 'de', key: 'langDe' },
]
const serverName = computed(() => url.value.replace(/^https?:\/\//, ''))
</script>

<template>
  <AppPage :title="$t('settings.title')" :back="false">
    <div class="screen">
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
        <IonItem router-link="/profile" detail lines="full"><IonLabel>{{ $t('settings.profileRow') }}</IonLabel></IonItem>
        <IonItem router-link="/account" detail lines="full"><IonLabel>{{ $t('settings.signInRow') }}</IonLabel></IonItem>
        <IonItem router-link="/privacy" detail lines="none"><IonLabel>{{ $t('settings.yourData') }}</IonLabel></IonItem>
      </IonList>

      <IonList inset>
        <IonListHeader>{{ $t('settings.app') }}</IonListHeader>
        <IonItem lines="full">
          <IonSelect :value="theme" :label="$t('settings.theme')" interface="action-sheet" @ion-change="setTheme($event.detail.value)">
            <IonSelectOption v-for="m in THEMES" :key="m" :value="m">{{ $t(`settings.theme${m[0]!.toUpperCase()}${m.slice(1)}`) }}</IonSelectOption>
          </IonSelect>
        </IonItem>
        <IonItem lines="full">
          <IonSelect :value="language" :label="$t('settings.language')" interface="action-sheet" @ion-change="setLanguage($event.detail.value)">
            <IonSelectOption v-for="l in LANGUAGES" :key="l.value" :value="l.value">{{ $t(`settings.${l.key}`) }}</IonSelectOption>
          </IonSelect>
        </IonItem>
        <IonItem lines="full">
          <IonSelect :value="units" :label="$t('settings.units')" interface="action-sheet" @ion-change="saveUnits($event.detail.value)">
            <IonSelectOption v-for="u in UNITS" :key="u" :value="u">{{ $t(`settings.units${u === 'metric' ? 'Metric' : 'Imperial'}`) }}</IonSelectOption>
          </IonSelect>
        </IonItem>
        <IonItem lines="full">
          <IonSelect :value="videosWifiOnly ? 'wifi' : 'any'" :label="$t('settings.videoUpload')" interface="action-sheet" @ion-change="setVideosWifiOnly($event.detail.value === 'wifi')">
            <IonSelectOption value="wifi">{{ $t('settings.videoWifi') }}</IonSelectOption>
            <IonSelectOption value="any">{{ $t('settings.videoAny') }}</IonSelectOption>
          </IonSelect>
        </IonItem>
        <IonItem router-link="/settings/server" detail lines="full">
          <IonLabel>{{ $t('settings.server') }}</IonLabel>
          <IonNote slot="end" class="server-note">{{ serverName }}</IonNote>
        </IonItem>
        <IonItem router-link="/settings/about" detail lines="none">
          <IonLabel>{{ $t('settings.about') }}</IonLabel>
          <IonNote slot="end">{{ APP_VERSION }}</IonNote>
        </IonItem>
      </IonList>

      <AppButton class="mt-3" secondary @click="signOut">{{ $t('settings.signOut') }}</AppButton>
    </div>
  </AppPage>
</template>

<style scoped>
.server-note {
  max-width: 55%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
