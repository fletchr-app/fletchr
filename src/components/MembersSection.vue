<script setup lang="ts">
import { IonIcon, IonItem, IonLabel } from '@ionic/vue'
import { chevronDown, chevronUp } from 'ionicons/icons'
import { ref } from 'vue'

import AppAvatar from '@/components/AppAvatar.vue'
import MemberActions from '@/components/MemberActions.vue'
import type { components } from '@/lib/api-types'
import { sortMembers } from '@/lib/team-admin'

type Member = components['schemas']['Member']

// Who is in the team. Admins can change roles and remove people; for everybody else it is a list.
defineProps<{ teamId: number; members: Member[]; isAdmin: boolean; myId: number | null }>()
defineEmits<{ changed: [] }>()

const open = ref<number | null>(null)
</script>

<template>
  <div class="d-flex flex-column gap-3">
    <h2 class="h5 m-0">{{ $t('teams.members') }}</h2>
    <div v-for="m in sortMembers(members)" :key="m.user_id" class="d-flex flex-column gap-2">
      <IonItem :button="isAdmin" :detail="false" lines="full" @click="isAdmin && (open = open === m.user_id ? null : m.user_id)">
        <AppAvatar slot="start" :name="m.name || m.email" :url="m.avatar_url" />
        <IonLabel class="ion-text-wrap">
          <h3>{{ m.name || m.email }}{{ m.user_id === myId ? ` (${$t('teams.you')})` : '' }}</h3>
          <p>{{ $t(`roles.${m.role}`) }}{{ m.email ? ` · ${m.email}` : '' }}{{ m.also_shoots ? ` · ${$t('teams.sharesTraining')}` : '' }}</p>
        </IonLabel>
        <IonIcon v-if="isAdmin" slot="end" :icon="open === m.user_id ? chevronUp : chevronDown" />
      </IonItem>
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
