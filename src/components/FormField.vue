<script setup lang="ts">
import { useId } from 'vue'

withDefaults(
  defineProps<{
    label: string
    type?: 'text' | 'password' | 'email'
    inputmode?: 'text' | 'decimal' | 'numeric' | 'email' | 'url'
    autocomplete?: string
    /** Words and sentences are capitalised by the keyboard; the default is none. */
    capitalize?: 'none' | 'sentences' | 'words' | 'characters'
    multiline?: boolean
    placeholder?: string
  }>(),
  { type: 'text', capitalize: 'none' },
)
const model = defineModel<string>({ required: true })
defineEmits<{ enter: [] }>()
const id = useId()
</script>

<template>
  <div>
    <label :for="id" class="form-label fw-semibold mb-1">{{ label }}</label>
    <textarea
      v-if="multiline"
      :id="id"
      v-model="model"
      class="form-control"
      rows="3"
      :autocapitalize="capitalize"
      :placeholder="placeholder"
    ></textarea>
    <input
      v-else
      :id="id"
      v-model="model"
      class="form-control"
      :type="type"
      :inputmode="inputmode"
      :autocomplete="autocomplete"
      :autocapitalize="capitalize"
      :placeholder="placeholder"
      autocorrect="off"
      spellcheck="false"
      @keyup.enter="$emit('enter')"
    />
  </div>
</template>
