<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'

import AppButton from '@/components/AppButton.vue'
import EndEditor from '@/components/EndEditor.vue'
import EndRows from '@/components/EndRows.vue'
import GearPicker from '@/components/GearPicker.vue'
import SessionPlots from '@/components/SessionPlots.vue'
import SyncBanner from '@/components/SyncBanner.vue'
import VolumeLog from '@/components/VolumeLog.vue'
import { useLog } from '@/composables/useLog'
import { gearFor, gearLine, sessionTotals, usesEnds } from '@/lib/log-model'

const route = useRoute()
const { loaded, sessions, equipment, setGear, finishSession, deleteSession } = useLog()
const confirmDelete = ref(false)
const changingGear = ref(false)
// null: a new end; otherwise the id of the end being edited. The key restarts the editor each time.
const editing = ref<string | null>(null)

const session = computed(() => sessions.value.find((s) => s.id === route.params.id))
const totals = computed(() => (session.value ? sessionTotals(session.value) : null))
const editedEnd = computed(() => session.value?.ends.find((e) => e.id === editing.value) ?? null)
</script>

<template>
  <div v-if="!session || !totals" class="screen">{{ loaded ? 'This session is not on this device.' : 'Loading…' }}</div>
  <div v-else class="screen">
    <SyncBanner />
    <h2 class="h5 m-0">{{ session.type }} · {{ new Date(session.started_at).toLocaleDateString() }}</h2>
    <div class="muted">
      {{ session.location ? `${session.location} · ` : '' }}{{ totals.arrows }} arrows{{ usesEnds(session.type) ? ` · ${totals.score} points` : '' }}{{ session.ended_at ? ' · finished' : '' }}
    </div>
    <div class="muted">
      Equipment: {{ gearLine(session.gear) || 'none chosen' }}
      <a href="#" @click.prevent="changingGear = !changingGear">{{ changingGear ? 'done' : 'change' }}</a>
    </div>
    <GearPicker
      v-if="changingGear"
      :equipment="equipment"
      :bow-id="session.gear?.bow_id ?? null"
      :arrow-set-id="session.gear?.arrow_set_id ?? null"
      @change="(bowId, arrowSetId) => setGear(session!.id, gearFor(equipment, bowId, arrowSetId))"
    />
    <template v-if="usesEnds(session.type)">
      <EndEditor :key="editedEnd?.id ?? `new-${session.ends.length}`" :session="session" :editing="editedEnd" @done="editing = null" />
      <h3 v-if="session.ends.length > 0" class="h6 mt-2 mb-0">Ends</h3>
      <EndRows :ends="session.ends" clickable @select="editing = $event.id" />
      <SessionPlots :session="session" />
    </template>
    <VolumeLog v-else :session="session" />
    <AppButton secondary @click="finishSession(session.id, !session.ended_at)">{{ session.ended_at ? 'Reopen session' : 'Finish session' }}</AppButton>
    <AppButton secondary @click="confirmDelete ? deleteSession(session.id) : (confirmDelete = true)">
      {{ confirmDelete ? 'Tap again to delete this session' : 'Delete session' }}
    </AppButton>
  </div>
</template>
