<script setup lang="ts">
import { alertController, IonIcon } from '@ionic/vue'
import { addOutline, exitOutline } from 'ionicons/icons'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import AppButton from '@/components/AppButton.vue'
import { useLog } from '@/composables/useLog'
import { type LogSession, nextEndDefaults } from '@/lib/log-model'

// Finish and New end of a session being shot, fixed to the bottom edge of the session page (`AppPage` footer).
const props = defineProps<{ session: LogSession }>()
const router = useRouter()
const { t } = useI18n()
const { finishSession } = useLog()

function newEnd() {
  const s = props.session
  if (s.ends.length === 0) return void router.push(`/training/${s.id}/setup`)
  const d = nextEndDefaults(s)
  void router.push({ path: `/training/${s.id}/end`, query: { distance: d.distance_m, face: d.face, arrows: String(d.arrows_per_end) } })
}
// Asked first: the button sits next to New end. A finished session can be reopened the same day.
async function askFinish() {
  const alert = await alertController.create({
    header: t('session.finishHeader'),
    message: t('session.finishMessage'),
    buttons: [
      { text: t('common.cancel'), role: 'cancel' },
      { text: t('session.finish'), handler: () => finish() },
    ],
  })
  await alert.present()
}
// Stays on the session page, which then shows the summary of the finished session.
function finish() {
  finishSession(props.session.id, true)
}
</script>

<template>
  <div class="d-flex gap-2">
    <AppButton secondary class="flex-fill" :aria-label="$t('session.finish')" @click="askFinish"><IonIcon slot="icon-only" :icon="exitOutline" /></AppButton>
    <AppButton class="flex-fill" :aria-label="$t('session.newEnd')" @click="newEnd"><IonIcon slot="icon-only" :icon="addOutline" /></AppButton>
  </div>
</template>
