<script setup lang="ts">
import { IonItem, IonLabel, IonList, IonNote } from '@ionic/vue'

import AppPage from '@/components/AppPage.vue'
import BrandMark from '@/components/BrandMark.vue'
import { useServer, useServerVersion } from '@/composables/useServer'
import { currentLanguage } from '@/i18n'

// What this app is: the version of the app and of the server it talks to, and where to read more.
const APP_VERSION = __APP_VERSION__
const { url } = useServer()
const serverVersion = useServerVersion()
// The site has the same pages in both languages.
const PAGES = { de: { home: '', privacy: 'datenschutz/', imprint: 'impressum/' }, en: { home: 'en/', privacy: 'en/privacy/', imprint: 'en/imprint/' } }
const page = (name: 'home' | 'privacy' | 'imprint') => `https://fletchr.de/${PAGES[currentLanguage() === 'de' ? 'de' : 'en'][name]}`
</script>

<template>
  <AppPage :title="$t('about.title')" back-href="/settings">
    <div class="screen">
      <div class="d-flex flex-column align-items-center gap-1 mt-3">
        <BrandMark :size="88" />
        <h2 class="h4 m-0">Fletchr</h2>
        <div class="muted">{{ $t('about.version', { version: APP_VERSION }) }}</div>
      </div>
      <div class="text-center">{{ $t('about.text') }}</div>

      <IonList inset>
        <IonItem lines="full">
          <IonLabel>{{ $t('about.app') }}</IonLabel>
          <IonNote slot="end">{{ APP_VERSION }}</IonNote>
        </IonItem>
        <IonItem lines="full">
          <IonLabel>
            {{ $t('about.server') }}
            <p>{{ url }}</p>
          </IonLabel>
          <IonNote slot="end">{{ serverVersion ?? $t('about.unknown') }}</IonNote>
        </IonItem>
        <IonItem lines="none">
          <IonLabel>{{ $t('about.licence') }}</IonLabel>
          <IonNote slot="end">AGPL-3.0-or-later</IonNote>
        </IonItem>
      </IonList>

      <IonList inset>
        <IonItem :href="page('home')" target="_blank" rel="noopener" detail lines="full"><IonLabel>{{ $t('about.website') }}</IonLabel></IonItem>
        <IonItem :href="page('privacy')" target="_blank" rel="noopener" detail lines="full"><IonLabel>{{ $t('about.privacy') }}</IonLabel></IonItem>
        <IonItem :href="page('imprint')" target="_blank" rel="noopener" detail lines="full"><IonLabel>{{ $t('about.imprint') }}</IonLabel></IonItem>
        <IonItem href="mailto:kontakt@fletchr.de" detail lines="none"><IonLabel>{{ $t('about.contact') }}</IonLabel><IonNote slot="end">kontakt@fletchr.de</IonNote></IonItem>
      </IonList>
    </div>
  </AppPage>
</template>
