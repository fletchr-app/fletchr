<script setup lang="ts">
import type { AutocompleteTypes } from '@ionic/core'
import { IonInput, IonTextarea } from '@ionic/vue'

withDefaults(
  defineProps<{
    label: string
    type?: 'text' | 'password' | 'email'
    inputmode?: 'text' | 'decimal' | 'numeric' | 'email' | 'url'
    autocomplete?: AutocompleteTypes
    /** Words and sentences are capitalised by the keyboard; the default is none. */
    capitalize?: 'none' | 'sentences' | 'words' | 'characters'
    multiline?: boolean
    placeholder?: string
  }>(),
  { type: 'text', capitalize: 'none' },
)
const model = defineModel<string>({ required: true })
defineEmits<{ enter: [] }>()
</script>

<template>
  <IonTextarea
    v-if="multiline"
    v-model="model"
    :label="label"
    label-placement="stacked"
    fill="outline"
    :rows="3"
    :autocapitalize="capitalize"
    :placeholder="placeholder"
  />
  <IonInput
    v-else
    v-model="model"
    :label="label"
    label-placement="stacked"
    fill="outline"
    :type="type"
    :inputmode="inputmode"
    :autocomplete="autocomplete"
    :autocapitalize="capitalize"
    :placeholder="placeholder"
    :autocorrect="false"
    :spellcheck="false"
    @keyup.enter="$emit('enter')"
  />
</template>
