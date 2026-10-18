<script setup lang="ts">
import { ref } from 'vue'

import AppButton from '@/components/AppButton.vue'
import ErrorText from '@/components/ErrorText.vue'
import FormField from '@/components/FormField.vue'
import { type DeletedCounts, useLog } from '@/composables/useLog'

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

function summary(d: DeletedCounts) {
  return [
    plural(d.sessions, 'session', 'sessions') + (d.shots > 0 ? ` (${plural(d.shots, 'scored arrow', 'scored arrows')})` : ''),
    plural(d.bows, 'bow', 'bows'),
    plural(d.arrow_sets, 'arrow set', 'arrow sets'),
    plural(d.notes_about_me, 'coach note about you', 'coach notes about you'),
  ].join(', ')
}

const { deleteMyData } = useLog()
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
    password.value = ''
    confirm.value = ''
  }
  busy.value = false
}
</script>

<template>
  <div class="d-flex flex-column gap-3 mt-4">
    <h2 class="h5 m-0">Delete my data</h2>
    <p class="m-0">
      This erases, for good: all your sessions with their arrows, all your bows and arrow sets, and the coach notes written about you
      (also the ones that were not shared with you). It also clears the copy on this device, including anything still waiting to upload.
    </p>
    <p class="m-0">
      It keeps your account, your profile and your teams, and the notes you wrote yourself about other archers. A copy may remain in
      server backups until they are rotated out.
    </p>
    <p class="m-0">It cannot be undone.</p>
    <div v-if="done" class="fw-semibold">Deleted: {{ summary(done) }}.</div>
    <template v-else>
      <FormField v-model="password" label="Your password" type="password" autocomplete="current-password" />
      <FormField v-model="confirm" label="Type DELETE to confirm" capitalize="characters" @enter="erase" />
      <ErrorText :message="error" />
      <AppButton :busy="busy" @click="erase">Delete my data</AppButton>
    </template>
  </div>
</template>
