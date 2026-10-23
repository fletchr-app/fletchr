<script setup lang="ts">
import { IonItem, IonLabel, IonList } from '@ionic/vue'

import { getFace } from '@/lib/faces'
import { withNumber } from '@/lib/arrow-numbers'
import { endTotal, type LogEnd, shotLabel, sortedShots } from '@/lib/log-model'

const props = defineProps<{ ends: LogEnd[]; clickable?: boolean }>()
defineEmits<{ select: [end: LogEnd] }>()

const newestFirst = () => [...props.ends].reverse()
</script>

<!-- The ends of a session, newest first, each with its arrows best first and its total. -->
<template>
  <IonList inset class="m-0">
    <IonItem
      v-for="(end, i) in newestFirst()"
      :key="end.id"
      :button="clickable"
      :detail="clickable"
      :lines="i === ends.length - 1 ? 'none' : 'full'"
      @click="clickable && $emit('select', end)"
    >
      <IonLabel>
        <h3>End {{ end.index + 1 }} · {{ sortedShots(end.shots).map((s) => withNumber(shotLabel(s), s)).join(' ') }} = {{ endTotal(end) }}</h3>
        <p>{{ end.distance_m }} m · {{ getFace(end.face)?.name ?? end.face }}</p>
      </IonLabel>
    </IonItem>
  </IonList>
</template>
