import { createRouter, createWebHistory } from 'vue-router'

import { authReady, useAuth } from '@/composables/useAuth'

declare module 'vue-router' {
  interface RouteMeta {
    title: string
    /** 'in': signed-in users only. 'out': signed-out users only. Otherwise open to everybody. */
    auth?: 'in' | 'out'
  }
}

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'home', component: () => import('@/views/HomeView.vue'), meta: { title: 'Archery Coach', auth: 'in' } },
    { path: '/join-team', component: () => import('@/views/JoinTeamView.vue'), meta: { title: 'Join a team', auth: 'in' } },
    { path: '/training', component: () => import('@/views/TrainingListView.vue'), meta: { title: 'Training', auth: 'in' } },
    { path: '/training/new', component: () => import('@/views/NewSessionView.vue'), meta: { title: 'New session', auth: 'in' } },
    { path: '/training/:id', component: () => import('@/views/TrainingSessionView.vue'), meta: { title: 'Session', auth: 'in' } },
    { path: '/privacy', component: () => import('@/views/PrivacyView.vue'), meta: { title: 'Your data', auth: 'in' } },
    { path: '/stats', component: () => import('@/views/StatsView.vue'), meta: { title: 'Statistics', auth: 'in' } },
    { path: '/sessions/:id', component: () => import('@/views/SessionDetailView.vue'), meta: { title: 'Session', auth: 'in' } },
    { path: '/team', component: () => import('@/views/TeamListView.vue'), meta: { title: 'Team', auth: 'in' } },
    { path: '/team/:id', component: () => import('@/views/TeamManageView.vue'), meta: { title: 'Team', auth: 'in' } },
    { path: '/archers/:id', component: () => import('@/views/ArcherSessionsView.vue'), meta: { title: 'Archer', auth: 'in' } },
    { path: '/equipment', component: () => import('@/views/EquipmentListView.vue'), meta: { title: 'Equipment', auth: 'in' } },
    { path: '/equipment/bows/:id', component: () => import('@/views/BowView.vue'), meta: { title: 'Bow', auth: 'in' } },
    { path: '/equipment/arrow-sets/:id', component: () => import('@/views/ArrowSetView.vue'), meta: { title: 'Arrow set', auth: 'in' } },
    { path: '/sign-in', component: () => import('@/views/SignInView.vue'), meta: { title: 'Sign in', auth: 'out' } },
    { path: '/register', component: () => import('@/views/RegisterView.vue'), meta: { title: 'Join with invite code', auth: 'out' } },
    { path: '/settings', component: () => import('@/views/SettingsView.vue'), meta: { title: 'Settings' } },
    { path: '/:rest(.*)*', redirect: '/' },
  ],
})

router.beforeEach(async (to) => {
  await authReady()
  const { status } = useAuth()
  if (to.meta.auth === 'in' && status.value !== 'signedIn') return '/sign-in'
  if (to.meta.auth === 'out' && status.value === 'signedIn') return '/'
})

export default router
