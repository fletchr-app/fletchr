<script setup lang="ts">
import { alertController, IonItem, IonLabel, IonList, IonListHeader, IonNote, IonSelect, IonSelectOption, IonToggle } from '@ionic/vue'
import { computed, ref } from 'vue'

import AppButton from '@/components/AppButton.vue'
import AppPage from '@/components/AppPage.vue'
import ErrorText from '@/components/ErrorText.vue'
import { useAuth } from '@/composables/useAuth'
import { useCreateTeam } from '@/composables/useCreateTeam'
import { REMINDER_CHOICES, useDeviceCalendar } from '@/composables/useDeviceCalendar'
import { type LanguageMode, useLocale } from '@/composables/useLocale'
import { useEquipment } from '@/composables/useEquipment'
import { useKeptMedia } from '@/composables/useKeptMedia'
import { useLog } from '@/composables/useLog'
import { useMedia } from '@/composables/useMedia'
import { useNotes } from '@/composables/useNotes'
import { usePush } from '@/composables/usePush'
import { useServer, useServerHealth } from '@/composables/useServer'
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

// Signing out empties the screens (the account's data stays on the phone under its key and comes back at the next sign-in), so it always asks.
// What has not reached the server stays too, but the person should know before leaving.
async function confirmSignOut() {
  const unsent =
    log.waiting.value + log.failed.value.length + media.items.value.length + equipment.waiting.value + equipment.failed.value.length + notes.waiting.value + notes.failed.value.length
  const alert = await alertController.create({
    header: t('settings.signOut'),
    message: [t('settings.signOutEmpty'), ...(unsent > 0 ? [t('settings.signOutWaiting', { n: unsent }, unsent)] : [])].join(' '),
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
const health = useServerHealth()
const { units, saveUnits } = useUnits()
const UNITS: Units[] = ['metric', 'imperial']
const { visibility: trainingVisibility, error: visibilityError, save: saveVisibility } = useTrainingVisibility()
const VISIBILITIES: Visibility[] = ['coaches', 'me']
const push = usePush()
const PUSH_TYPES = ['notes', 'evaluations', 'team'] as const
// Android asks when the switch is turned on. After two refusals it shows no dialog, and only the system settings help.
const deniedHint = ref(false)
async function toggleNotifications(event: CustomEvent<{ checked: boolean }>) {
  if (event.detail.checked === push.on.value) return
  const now = await push.setEnabled(event.detail.checked)
  deniedHint.value = event.detail.checked && !now && push.permission.value === 'denied'
  // Refused: the switch must not stay on
  ;(event.target as HTMLIonToggleElement).checked = now
}
const { videosWifiOnly, setVideosWifiOnly } = useUploadSettings()
const kept = useKeptMedia()
const calendar = useDeviceCalendar()
async function toggleCalendar(event: CustomEvent<{ checked: boolean }>) {
  if (!event.detail.checked) return void (await calendar.disable())
  // Refused: the switch must not stay on
  if (!(await calendar.enable())) (event.target as HTMLIonToggleElement).checked = false
}
const calendarHint = computed(() => {
  const status = calendar.status.value
  if (status === 'noPermission') return t('deviceCalendar.denied')
  if (status === 'error') return t('deviceCalendar.failed')
  if (status === 'offline') return t('deviceCalendar.offline')
  const last = calendar.lastSync.value
  return last ? t('deviceCalendar.updated', { time: new Date(last).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }) : t('deviceCalendar.hint')
})
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
      <IonList v-if="push.available.value" inset>
        <IonListHeader>{{ $t('push.settings.title') }}</IonListHeader>
        <IonItem :lines="push.on.value ? 'full' : 'none'" class="ion-text-wrap">
          <IonToggle
            :checked="push.on.value"
            label-placement="start"
            justify="space-between"
            @ion-change="toggleNotifications"
          >
            <IonLabel class="ion-text-wrap">
              {{ $t('push.settings.enable') }}
              <p class="muted">{{ $t('push.settings.enableHint') }}</p>
            </IonLabel>
          </IonToggle>
        </IonItem>
        <template v-if="push.on.value">
          <IonItem v-for="type in PUSH_TYPES" :key="type" lines="full" class="ion-text-wrap">
            <IonToggle
              :checked="push.prefs.value[type]"
              label-placement="start"
              justify="space-between"
              @ion-change="$event.detail.checked !== push.prefs.value[type] && push.setPref(type, $event.detail.checked)"
            >
              <IonLabel class="ion-text-wrap">
                {{ $t(`push.settings.${type}`) }}
                <p v-if="type === 'team'" class="muted">{{ $t('push.settings.teamHint') }}</p>
              </IonLabel>
            </IonToggle>
          </IonItem>
        </template>
        <IonItem v-if="deniedHint" lines="none" class="ion-text-wrap"><IonLabel class="ion-text-wrap">{{ $t('push.settings.denied') }}</IonLabel></IonItem>
      </IonList>
      <div v-if="push.available.value && push.on.value" class="muted px-3">{{ $t('push.settings.hint') }}</div>
      <ErrorText :message="push.prefsError.value" />
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
        <IonItem button detail :lines="calendar.supported ? 'full' : 'none'" @click="creating.ask"><IonLabel>{{ $t('settings.createTeam') }}</IonLabel></IonItem>
        <template v-if="calendar.supported">
          <IonItem :lines="calendar.enabled.value ? 'full' : 'none'" class="ion-text-wrap">
            <IonToggle :checked="calendar.enabled.value" @ion-change="toggleCalendar">
              {{ $t('deviceCalendar.toggle') }}
              <IonNote class="d-block ion-text-wrap">{{ calendarHint }}</IonNote>
            </IonToggle>
          </IonItem>
          <IonItem v-if="calendar.enabled.value" lines="none">
            <IonSelect :value="String(calendar.reminder.value)" :label="$t('deviceCalendar.reminder')" interface="action-sheet" @ion-change="calendar.setReminder(Number($event.detail.value))">
              <IonSelectOption v-for="m in REMINDER_CHOICES" :key="m" :value="String(m)">{{ $t(`deviceCalendar.reminder${m || 'None'}`) }}</IonSelectOption>
            </IonSelect>
          </IonItem>
        </template>
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
        <IonItem v-if="!isLocal" lines="full">
          <IonLabel>{{ $t('settings.server') }}</IonLabel>
          <IonNote slot="end" class="server-note">{{ health === 'unreachable' ? `${serverName} (${$t('settings.unreachable')})` : serverName }}</IonNote>
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
