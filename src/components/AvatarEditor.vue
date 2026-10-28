<script setup lang="ts">
import { actionSheetController } from '@ionic/vue'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

import AppAvatar from '@/components/AppAvatar.vue'
import AppButton from '@/components/AppButton.vue'
import ErrorText from '@/components/ErrorText.vue'
import { useAuth } from '@/composables/useAuth'
import { errorMessage } from '@/lib/errors'
import { prepareAvatar } from '@/lib/image'
import { pickMedia } from '@/lib/pick-media'

// The picture of a person, with the buttons to take, choose or remove it. `archer` is the profile of an archer without
// an account that a coach keeps; without it the picture is the signed-in person's own.
const props = defineProps<{ name: string; url: string; allowed: boolean; archer?: { teamId: number; userId: number } }>()
const emit = defineEmits<{ changed: [] }>()

const { t } = useI18n()
const { api } = useAuth()
const busy = ref(false)
const error = ref<string | null>(null)

async function choose() {
  const sheet = await actionSheetController.create({
    header: t('avatar.header'),
    buttons: [
      { text: t('avatar.takePhoto'), handler: () => void set('photo') },
      { text: t('avatar.fromGallery'), handler: () => void set('gallery') },
      ...(props.url ? [{ text: t('avatar.remove'), role: 'destructive', handler: () => void remove() }] : []),
      { text: t('common.cancel'), role: 'cancel' },
    ],
  })
  await sheet.present()
}

async function set(source: 'photo' | 'gallery') {
  busy.value = true
  error.value = null
  try {
    const picked = await pickMedia(source)
    if (!picked || picked.kind !== 'photo') return
    const form = new FormData()
    form.append('file', await prepareAvatar(picked.blob), 'avatar.jpg')
    const bodySerializer = () => form
    const { response, error: failure } = props.archer
      ? await api.PUT('/api/teams/{team_id}/archers/{user_id}/avatar/', { params: { path: { team_id: props.archer.teamId, user_id: props.archer.userId } }, body: { file: '' }, bodySerializer })
      : await api.PUT('/api/me/avatar/', { body: { file: '' }, bodySerializer })
    if (response.ok) emit('changed')
    else error.value = errorMessage(failure)
  } catch {
    error.value = t('avatar.failed')
  } finally {
    busy.value = false
  }
}

async function remove() {
  busy.value = true
  error.value = null
  try {
    const { response, error: failure } = props.archer
      ? await api.DELETE('/api/teams/{team_id}/archers/{user_id}/avatar/', { params: { path: { team_id: props.archer.teamId, user_id: props.archer.userId } } })
      : await api.DELETE('/api/me/avatar/')
    if (response.ok) emit('changed')
    else error.value = errorMessage(failure)
  } catch {
    error.value = t('common.serverNotReachable')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="d-flex flex-column align-items-center gap-2">
    <AppAvatar :name="name" :url="allowed ? url : ''" :size="96" />
    <AppButton v-if="allowed" secondary :busy="busy" @click="choose">{{ url ? $t('avatar.change') : $t('avatar.add') }}</AppButton>
    <div v-else class="muted text-center">{{ $t('avatar.needsConsent') }}</div>
    <div class="faint text-center">{{ archer ? $t('avatar.whoSeesArcher') : $t('avatar.whoSees') }}</div>
    <ErrorText :message="error" />
  </div>
</template>
