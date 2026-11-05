<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { useAuth } from '@/composables/useAuth'

// An error in red. "Server not reachable" is left out for someone who is signed in: the banner under the app bar says it once for the
// whole app (src/components/ConnectionBanner.vue). Before signing in there is no banner, so there it stays.
const props = defineProps<{ message?: string | null }>()
const { t } = useI18n()
const { status } = useAuth()
const shown = computed(() => (status.value === 'signedIn' && props.message === t('common.serverNotReachable') ? null : props.message))
</script>

<template>
  <div v-if="shown" class="text-danger" role="alert">{{ shown }}</div>
</template>
