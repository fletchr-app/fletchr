<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

import AppButton from '@/components/AppButton.vue'
import ErrorText from '@/components/ErrorText.vue'
import FormField from '@/components/FormField.vue'
import { type DeletedCounts, useLog } from '@/composables/useLog'
import { useMedia } from '@/composables/useMedia'

const { t } = useI18n()

function summary(d: DeletedCounts) {
  return [
    t('privacy.sessions', { n: d.sessions }, d.sessions) + (d.shots > 0 ? ` (${t('privacy.shots', { n: d.shots }, d.shots)})` : ''),
    t('privacy.media', { n: d.media }, d.media),
    t('privacy.bows', { n: d.bows }, d.bows),
    t('privacy.arrowSets', { n: d.arrow_sets }, d.arrow_sets),
    t('privacy.notesAboutMe', { n: d.notes_about_me }, d.notes_about_me),
  ].join(', ')
}

const { deleteMyData } = useLog()
const { discardAll } = useMedia()
const password = ref('')
const confirm = ref('')
const busy = ref(false)
const error = ref<string | null>(null)
const done = ref<DeletedCounts | null>(null)

async function erase() {
  busy.value = true
  error.value = null
  const result = await deleteMyData(password.value, confirm.value)
  if ('error' in result) error.value = result.error
  else {
    done.value = result.deleted
    discardAll() // photos still waiting to go up would bring the data back
    password.value = ''
    confirm.value = ''
  }
  busy.value = false
}
</script>

<template>
  <div class="d-flex flex-column gap-3 mt-4">
    <h2 class="h5 m-0">{{ $t('privacy.deleteDataTitle') }}</h2>
    <p class="m-0">{{ $t('privacy.deleteDataText1') }}</p>
    <p class="m-0">{{ $t('privacy.deleteDataText2') }}</p>
    <p class="m-0">{{ $t('privacy.cannotUndo') }}</p>
    <div v-if="done" class="fw-semibold">{{ $t('privacy.deletedSummary', { summary: summary(done) }) }}</div>
    <template v-else>
      <FormField v-model="password" :label="$t('privacy.password')" type="password" autocomplete="current-password" />
      <FormField v-model="confirm" :label="$t('privacy.typeDelete')" capitalize="characters" @enter="erase" />
      <ErrorText :message="error" />
      <AppButton :busy="busy" @click="erase">{{ $t('privacy.deleteData') }}</AppButton>
    </template>
  </div>
</template>
