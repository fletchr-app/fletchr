<script setup lang="ts">
import { ref } from 'vue'

import MemberActions from '@/components/MemberActions.vue'
import type { components } from '@/lib/api-types'
import { roleLabel, sortMembers } from '@/lib/team-admin'

type Member = components['schemas']['Member']

// Who is in the team. Admins can change roles and remove people; for everybody else it is a list.
defineProps<{ teamId: number; members: Member[]; isAdmin: boolean; myId: number | null }>()
defineEmits<{ changed: [] }>()

const open = ref<number | null>(null)
</script>

<template>
  <div class="d-flex flex-column gap-3">
    <h2 class="h5 m-0">Members</h2>
    <div v-for="m in sortMembers(members)" :key="m.user_id" class="d-flex flex-column gap-2">
      <component
        :is="isAdmin ? 'button' : 'div'"
        :type="isAdmin ? 'button' : undefined"
        class="text-start p-0 border-0 bg-transparent text-reset"
        @click="isAdmin && (open = open === m.user_id ? null : m.user_id)"
      >
        <div class="fw-semibold">{{ m.name || m.email }}{{ m.user_id === myId ? ' (you)' : '' }}</div>
        <div class="muted">
          {{ roleLabel(m.role) }} · {{ m.email }}{{ m.also_shoots ? ' · shares own training' : '' }}{{ isAdmin ? (open === m.user_id ? '  ▴' : '  ▾') : '' }}
        </div>
      </component>
      <MemberActions
        v-if="isAdmin && open === m.user_id"
        :team-id="teamId"
        :member="m"
        :is-me="m.user_id === myId"
        @changed="open = null; $emit('changed')"
      />
    </div>
  </div>
</template>
