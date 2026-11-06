<script setup lang="ts">
import { onIonViewWillEnter } from '@ionic/vue'
import { ref, watch } from 'vue'

import AppPage from '@/components/AppPage.vue'
import ArcherProfile from '@/components/ArcherProfile.vue'
import AvatarEditor from '@/components/AvatarEditor.vue'
import ProfileMenu from '@/components/ProfileMenu.vue'
import { useAuth } from '@/composables/useAuth'
import { useConnection } from '@/composables/useConnection'
import { useOnReconnect } from '@/composables/useOnReconnect'
import { useOwnProfile } from '@/composables/useProfile'

// The start page is your own profile, the same page a coach sees of an archer. It is filled from the device first, so it works without
// a connection and without an account; the picture, evaluations, coach notes and teams come from the server (src/composables/useProfile.ts).
const { isLocal } = useAuth()
const data = useOwnProfile()
const avatarEditor = ref<InstanceType<typeof AvatarEditor> | null>(null)

// Each time the screen is shown: it stays alive between visits, so a new team or note would not appear otherwise.
let firstVisit = true // the first load happens when the screen is created
onIonViewWillEnter(() => {
  if (firstVisit) firstVisit = false
  else data.reload()
})
// A load that failed offline is tried again when the connection returns or the app comes back.
useOnReconnect(() => data.reload())
// The server itself can come back without the phone's network changing (a restart, a stopped proxy): the banner's check finds out.
const { reachable } = useConnection()
watch(reachable, (now, before) => now && !before && data.reload())
</script>

<template>
  <AppPage :title="data.name || 'Fletchr'" :back="false">
    <template v-if="!isLocal" #actions>
      <ProfileMenu :avatar-url="data.avatarUrl" :avatar-allowed="data.avatarAllowed" @picture="avatarEditor?.choose()" />
    </template>
    <AvatarEditor v-if="!isLocal" ref="avatarEditor" bare :name="data.name" :url="data.avatarUrl" :allowed="data.avatarAllowed" @changed="data.reloadArcher" />
    <ArcherProfile :data="data" />
  </AppPage>
</template>
