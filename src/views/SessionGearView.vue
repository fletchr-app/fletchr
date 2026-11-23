<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import AppButton from '@/components/AppButton.vue'
import AppPage from '@/components/AppPage.vue'
import GearPicker from '@/components/GearPicker.vue'
import { useLog } from '@/composables/useLog'
import { chosenKeys, gearFor } from '@/lib/log-model'

// The bow and arrow set of a session, changed afterwards (also on a finished session). While shooting, the end setup has the same picker.
const route = useRoute()
const router = useRouter()
const { loaded, sessions, equipment, setGear } = useLog()

const sessionId = route.params.id as string
const session = computed(() => sessions.value.find((s) => s.id === sessionId))

const start = chosenKeys(equipment.value, session.value?.gear)
const bowKey = ref(start.bowKey)
const arrowSetKey = ref(start.arrowSetKey)

function save() {
  if (bowKey.value !== start.bowKey || arrowSetKey.value !== start.arrowSetKey) {
    setGear(sessionId, gearFor(equipment.value, bowKey.value, arrowSetKey.value))
  }
  router.back()
}
</script>

<template>
  <AppPage :title="$t('gear.title')">
    <div v-if="!session" class="screen">{{ loaded ? $t('session.notOnDevice') : $t('common.loading') }}</div>
    <div v-else class="screen">
      <GearPicker
        :equipment="equipment"
        :bow-key="bowKey"
        :arrow-set-key="arrowSetKey"
        @change="(b, a) => ((bowKey = b), (arrowSetKey = a))"
      />
      <AppButton @click="save">{{ $t('common.save') }}</AppButton>
    </div>
  </AppPage>
</template>
