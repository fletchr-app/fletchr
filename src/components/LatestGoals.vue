<script setup lang="ts">
import { computed } from 'vue'

import { useAuth } from '@/composables/useAuth'
import { useRemote } from '@/composables/useRemote'
import { currentGoals, type Evaluated } from '@/lib/progress'

// What to work on until the next evaluation: the goals of the newest evaluation a coach shared with you and of your newest
// self-assessment. `refresh` goes up each time the Home screen is shown.
const props = defineProps<{ userId: number; refresh?: number }>()
const { api } = useAuth()
const { data } = useRemote(async () => (await api.GET('/api/evaluations/', { params: { query: { archer: props.userId } } })).data ?? null, {
  watch: [() => props.refresh],
})
const goals = computed(() => currentGoals((data.value ?? []) as unknown as Evaluated[]))
</script>

<template>
  <div v-if="goals.length" class="d-flex flex-column gap-2">
    <div class="fw-semibold">{{ $t('progress.goals') }}</div>
    <div v-for="g in goals" :key="g.kind">
      <div class="muted">{{ $t(g.kind === 'self' ? 'progress.goalsSelf' : 'progress.goalsCoach', { date: new Date(g.evaluation.date ?? g.evaluation.created_at).toLocaleDateString() }) }}</div>
      <div style="white-space: pre-wrap">{{ g.evaluation.goals }}</div>
    </div>
    <router-link :to="`/archers/${userId}/progress`">{{ $t('progress.link') }}</router-link>
  </div>
</template>
