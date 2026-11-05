<script setup lang="ts">
import { computed } from 'vue'

import { currentGoals, type Evaluated } from '@/lib/progress'

// What to work on until the next evaluation: the goals of the newest evaluation a coach shared with you and of your newest self-assessment.
const props = defineProps<{ userId: number; evaluations: unknown[] | null }>()
const goals = computed(() => currentGoals((props.evaluations ?? []) as Evaluated[]))
</script>

<template>
  <div v-if="goals.length" class="d-flex flex-column gap-2">
    <div v-for="g in goals" :key="g.kind">
      <div class="muted">{{ $t(g.kind === 'self' ? 'progress.goalsSelf' : 'progress.goalsCoach', { date: new Date(g.evaluation.date ?? g.evaluation.created_at).toLocaleDateString() }) }}</div>
      <div style="white-space: pre-wrap">{{ g.evaluation.goals }}</div>
    </div>
    <router-link :to="`/archers/${userId}/progress`">{{ $t('progress.link') }}</router-link>
  </div>
</template>
