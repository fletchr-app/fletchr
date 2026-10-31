<script setup lang="ts">
import { IonButton } from '@ionic/vue'
import { ref } from 'vue'

import FormField from '@/components/FormField.vue'
import { useNotes } from '@/composables/useNotes'

// The text of a note on this device without an account, with a button to change it (#93). The slot is for more buttons next to Change.
const props = defineProps<{ uid: string; body: string }>()

const { edit } = useNotes()
const editing = ref(false)
const text = ref('')

function start() {
  text.value = props.body
  editing.value = true
}
function save() {
  const body = text.value.trim()
  if (body) edit(props.uid, { body })
  editing.value = false
}
</script>

<template>
  <template v-if="editing">
    <FormField v-model="text" :label="$t('local.changeNote')" multiline capitalize="sentences" />
    <div class="d-flex gap-2">
      <IonButton size="small" class="m-0" :disabled="!text.trim()" @click="save">{{ $t('common.save') }}</IonButton>
      <IonButton fill="clear" size="small" class="m-0" @click="editing = false">{{ $t('common.cancel') }}</IonButton>
    </div>
  </template>
  <template v-else>
    <div style="white-space: pre-wrap">{{ body }}</div>
    <div class="d-flex gap-2">
      <IonButton fill="clear" size="small" class="m-0" @click="start">{{ $t('local.changeNote') }}</IonButton>
      <slot />
    </div>
  </template>
</template>
