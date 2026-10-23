<script setup lang="ts">
import { IonItem, IonLabel, IonList, IonListHeader, IonNote } from '@ionic/vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import AppButton from '@/components/AppButton.vue'
import AppPage from '@/components/AppPage.vue'
import ErrorText from '@/components/ErrorText.vue'
import { useAuth } from '@/composables/useAuth'
import { useCreateTeam } from '@/composables/useCreateTeam'
import { useLocale } from '@/composables/useLocale'
import { useServer } from '@/composables/useServer'
import { useTheme } from '@/composables/useTheme'

// The tab for everything that is not training: equipment, teams, account and data, and how the app looks and
// where it connects. Each app setting is a row that shows its value and opens its own page.
const { status, signOut } = useAuth()
const signedIn = computed(() => status.value === 'signedIn')
const creating = useCreateTeam()
const { t } = useI18n()
const { mode: theme } = useTheme()
const { mode: language } = useLocale()
const { url } = useServer()

const themeName = computed(() => t(`settings.theme${theme.value[0]!.toUpperCase()}${theme.value.slice(1)}`))
const languageName = computed(() => t(`settings.lang${language.value === 'system' ? 'System' : language.value === 'en' ? 'En' : 'De'}`))
const serverName = computed(() => url.value.replace(/^https?:\/\//, ''))
</script>

<template>
  <AppPage :title="$t('settings.title')" :back="false">
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

      <IonList inset>
        <IonListHeader>{{ $t('settings.app') }}</IonListHeader>
        <IonItem router-link="/settings/theme" detail lines="full">
          <IonLabel>{{ $t('settings.theme') }}</IonLabel>
          <IonNote slot="end">{{ themeName }}</IonNote>
        </IonItem>
        <IonItem router-link="/settings/language" detail lines="full">
          <IonLabel>{{ $t('settings.language') }}</IonLabel>
          <IonNote slot="end">{{ languageName }}</IonNote>
        </IonItem>
        <IonItem router-link="/settings/server" detail lines="none">
          <IonLabel>{{ $t('settings.server') }}</IonLabel>
          <IonNote slot="end" class="server-note">{{ serverName }}</IonNote>
        </IonItem>
      </IonList>

      <AppButton v-if="signedIn" class="mt-3" secondary @click="signOut">{{ $t('settings.signOut') }}</AppButton>
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
