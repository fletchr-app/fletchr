<script setup lang="ts">
import { alertController, IonItem, IonLabel, IonList, IonListHeader, IonNote, IonSelect, IonSelectOption } from '@ionic/vue'
import { computed } from 'vue'

import AppButton from '@/components/AppButton.vue'
import AppPage from '@/components/AppPage.vue'
import ErrorText from '@/components/ErrorText.vue'
import { useAuth } from '@/composables/useAuth'
import { useCreateTeam } from '@/composables/useCreateTeam'
import { type LanguageMode, useLocale } from '@/composables/useLocale'
import { useEquipment } from '@/composables/useEquipment'
import { useKeptMedia } from '@/composables/useKeptMedia'
import { useLog } from '@/composables/useLog'
import { useMedia } from '@/composables/useMedia'
import { useNotes } from '@/composables/useNotes'
import { useServer } from '@/composables/useServer'
import { type ThemeMode, useTheme } from '@/composables/useTheme'
import { useTrainingVisibility } from '@/composables/useTrainingVisibility'
import { useUnits } from '@/composables/useUnits'
import { useUploadSettings } from '@/composables/useUploadSettings'
import { t } from '@/i18n'
import { CAP_CHOICES_MB } from '@/lib/media-keep'
import type { Visibility } from '@/lib/log-model'
import type { Units } from '@/lib/units'

// The tab for everything that is not training: equipment, teams, account and data, and how the app looks and
// where it connects. Theme and language are picked in a sheet; the server address has its own page.
const { signOut, isLocal } = useAuth()
const log = useLog()
const media = useMedia()
const equipment = useEquipment()
const notes = useNotes()

// What has not reached the server stays on the phone under this account, but the person should know before leaving.
async function confirmSignOut() {
  const unsent =
    log.waiting.value + log.failed.value.length + media.items.value.length + equipment.waiting.value + equipment.failed.value.length + notes.waiting.value + notes.failed.value.length
  if (unsent === 0) return void signOut()
  const alert = await alertController.create({
    header: t('settings.signOut'),
    message: t('settings.signOutWaiting', { n: unsent }, unsent),
    buttons: [
      { text: t('common.cancel'), role: 'cancel' },
      { text: t('settings.signOut'), role: 'confirm' },
    ],
  })
  await alert.present()
  if ((await alert.onDidDismiss()).role === 'confirm') await signOut()
}
const APP_VERSION = __APP_VERSION__
const creating = useCreateTeam()
const { mode: theme, setMode: setTheme } = useTheme()
const { mode: language, setMode: setLanguage } = useLocale()
const { url } = useServer()
const { units, saveUnits } = useUnits()
const UNITS: Units[] = ['metric', 'imperial']
const { visibility: trainingVisibility, error: visibilityError, save: saveVisibility } = useTrainingVisibility()
const VISIBILITIES: Visibility[] = ['coaches', 'me']
const { videosWifiOnly, setVideosWifiOnly } = useUploadSettings()
const kept = useKeptMedia()
const capLabel = (mb: number | null) => (mb === null ? t('settings.keepNoLimit') : mb === 0 ? t('settings.keepNothing') : mb >= 1000 ? `${mb / 1000} GB` : `${mb} MB`)
const keptSize = computed(() => `${Math.round(kept.bytes.value / (1024 * 1024))} MB`)

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
        <IonItem router-link="/equipment" detail :lines="isLocal ? 'none' : 'full'"><IonLabel>{{ $t('settings.equipment') }}</IonLabel></IonItem>
        <IonItem v-if="!isLocal" lines="none">
          <IonSelect
            :value="trainingVisibility"
            :label="$t('settings.trainingVisibility')"
            interface="action-sheet"
            @ion-change="$event.detail.value !== trainingVisibility && saveVisibility($event.detail.value)"
          >
            <IonSelectOption v-for="v in VISIBILITIES" :key="v" :value="v">{{ $t(`visibility.${v}`) }}</IonSelectOption>
          </IonSelect>
        </IonItem>
      </IonList>
      <div v-if="!isLocal" class="muted px-3">{{ $t('settings.trainingVisibilityHint') }}</div>
      <ErrorText :message="visibilityError" />
      <template v-if="isLocal">
        <IonList inset>
          <IonListHeader>{{ $t('settings.account') }}</IonListHeader>
          <IonItem lines="full" class="ion-text-wrap"><IonLabel class="ion-text-wrap">{{ $t('local.settingsNote') }}</IonLabel></IonItem>
          <IonItem router-link="/settings/data" detail lines="full"><IonLabel>{{ $t('local.dataRow') }}</IonLabel></IonItem>
          <IonItem router-link="/sign-in" detail lines="none"><IonLabel>{{ $t('local.signInRow') }}</IonLabel></IonItem>
        </IonList>
        <div class="muted px-3">{{ $t('local.signInText') }}</div>
      </template>
      <template v-else>
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
      </template>

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
        <IonItem v-if="!isLocal" lines="full">
          <IonSelect :value="videosWifiOnly ? 'wifi' : 'any'" :label="$t('settings.videoUpload')" interface="action-sheet" @ion-change="setVideosWifiOnly($event.detail.value === 'wifi')">
            <IonSelectOption value="wifi">{{ $t('settings.videoWifi') }}</IonSelectOption>
            <IonSelectOption value="any">{{ $t('settings.videoAny') }}</IonSelectOption>
          </IonSelect>
        </IonItem>
        <IonItem v-if="!isLocal" lines="full">
          <IonSelect :value="String(kept.capMb.value)" :label="$t('settings.keepMedia')" interface="action-sheet" @ion-change="kept.setCap($event.detail.value === 'null' ? null : Number($event.detail.value))">
            <IonSelectOption v-for="mb in CAP_CHOICES_MB" :key="String(mb)" :value="String(mb)">{{ capLabel(mb) }}</IonSelectOption>
          </IonSelect>
        </IonItem>
        <IonItem v-if="!isLocal && kept.count.value > 0" lines="full">
          <IonLabel class="ion-text-wrap">{{ $t('settings.keptNow', { size: keptSize, n: kept.count.value }, kept.count.value) }}</IonLabel>
          <AppButton secondary @click="kept.clear">{{ $t('settings.keptClear') }}</AppButton>
        </IonItem>
        <IonItem v-if="!isLocal" router-link="/settings/server" detail lines="full">
          <IonLabel>{{ $t('settings.server') }}</IonLabel>
          <IonNote slot="end" class="server-note">{{ serverName }}</IonNote>
        </IonItem>
        <IonItem router-link="/settings/about" detail lines="none">
          <IonLabel>{{ $t('settings.about') }}</IonLabel>
          <IonNote slot="end">{{ APP_VERSION }}</IonNote>
        </IonItem>
      </IonList>

      <AppButton v-if="!isLocal" class="mt-3" secondary @click="confirmSignOut">{{ $t('settings.signOut') }}</AppButton>
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
