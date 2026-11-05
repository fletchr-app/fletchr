<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'

import AppPage from '@/components/AppPage.vue'
import ArcherMenu from '@/components/ArcherMenu.vue'
import ArcherProfile from '@/components/ArcherProfile.vue'
import AvatarEditor from '@/components/AvatarEditor.vue'
import { useArcherProfile } from '@/composables/useProfile'

// An archer as their coach sees them: the profile component with the server's data. The actions are in a menu in the app bar (ArcherMenu).
// For an archer without an account the coach can also log sessions for them and manage the profile.
const route = useRoute()
const id = Number(route.params.id)
const name = route.query.name as string | undefined

const data = useArcherProfile(id, name ?? '')
const menuError = ref<string | null>(null)
const avatarEditor = ref<InstanceType<typeof AvatarEditor> | null>(null)
// A new training: a full session for an archer without an account, an opened one (photos, videos, notes) for the others.
const newTraining = computed(() => {
  if (!data.archer) return undefined
  const base = `/training/new?for=${id}&name=${encodeURIComponent(data.name)}`
  return data.managed ? base : `${base}&open=1&managed=0`
})
</script>

<template>
  <AppPage :title="data.name || $t('archer.defaultTitle')">
    <template #actions>
      <ArcherMenu :archer="data.archer" :archer-id="id" :name="data.name" @changed="data.reloadArcher" @renamed="data.reloadArcher" @picture="avatarEditor?.choose()" @error="menuError = $event" />
    </template>
    <AvatarEditor
      v-if="data.archer?.managed && data.archer.team_id"
      ref="avatarEditor"
      bare
      :name="data.name"
      :url="data.avatarUrl"
      :allowed="data.avatarAllowed"
      :archer="{ teamId: data.archer.team_id, userId: id }"
      @changed="data.reloadArcher"
    />
    <ArcherProfile :data="data" :new-training="newTraining" :archer-menu-error="menuError" />
  </AppPage>
</template>
