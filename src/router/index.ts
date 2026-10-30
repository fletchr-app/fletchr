import { createRouter, createWebHistory } from '@ionic/vue-router'

import { authReady, useAuth } from '@/composables/useAuth'

declare module 'vue-router' {
  interface RouteMeta {
    title: string
    /** 'in': signed in, or using the app without an account (local). 'account': needs an account on a server. 'out': not signed in (also open to local, to sign in later). Otherwise open to everybody. */
    auth?: 'in' | 'account' | 'out'
    /** A top-level screen, reached from the tab bar. */
    tab?: boolean
  }
}

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'home', component: () => import('@/views/HomeView.vue'), meta: { title: 'Fletchr', auth: 'in', tab: true } },
    { path: '/join-team', component: () => import('@/views/JoinTeamView.vue'), meta: { title: 'Join a team', auth: 'account' } },
    { path: '/training', component: () => import('@/views/TrainingListView.vue'), meta: { title: 'Training', auth: 'in', tab: true } },
    { path: '/training/new', component: () => import('@/views/NewSessionView.vue'), meta: { title: 'New session', auth: 'in' } },
    { path: '/training/:id', component: () => import('@/views/TrainingSessionView.vue'), meta: { title: 'Session', auth: 'in' } },
    { path: '/events/:id', component: () => import('@/views/EventView.vue'), meta: { title: 'Training', auth: 'account' } },
    { path: '/local-media/:id', component: () => import('@/views/LocalMediaView.vue'), meta: { title: 'Photo or video', auth: 'in' } },
    { path: '/media/:id', component: () => import('@/views/MediaPlayerView.vue'), meta: { title: 'Photo or video', auth: 'in' } },
    { path: '/media', component: () => import('@/views/MediaView.vue'), meta: { title: 'Photos', auth: 'in' } },
    { path: '/training/:id/details', component: () => import('@/views/SessionDetailsView.vue'), meta: { title: 'Session notes', auth: 'in' } },
    { path: '/training/:id/notes', component: () => import('@/views/SessionNotesView.vue'), meta: { title: 'Notes', auth: 'in' } },
    { path: '/training/:id/setup', component: () => import('@/views/EndSetupView.vue'), meta: { title: 'New end', auth: 'in' } },
    { path: '/training/:id/end', component: () => import('@/views/EndEntryView.vue'), meta: { title: 'Arrows', auth: 'in' } },
    { path: '/training/:id/ends', component: () => import('@/views/SessionEndsView.vue'), meta: { title: 'Ends', auth: 'in' } },
    { path: '/profile', component: () => import('@/views/ProfileView.vue'), meta: { title: 'Profile', auth: 'account' } },
    { path: '/account', component: () => import('@/views/AccountView.vue'), meta: { title: 'Account', auth: 'account' } },
    { path: '/privacy', component: () => import('@/views/PrivacyView.vue'), meta: { title: 'Your data', auth: 'account' } },
    { path: '/stats', component: () => import('@/views/StatsView.vue'), meta: { title: 'Statistics', auth: 'in', tab: true } },
    { path: '/archers/:id/stats', component: () => import('@/views/StatsView.vue'), meta: { title: 'Statistics', auth: 'account' } },
    { path: '/stats/heatmap', component: () => import('@/views/StatsHeatmapView.vue'), meta: { title: 'Heatmap', auth: 'in' } },
    { path: '/archers/:id/stats/heatmap', component: () => import('@/views/StatsHeatmapView.vue'), meta: { title: 'Heatmap', auth: 'account' } },
    { path: '/sessions/:id', component: () => import('@/views/SessionDetailView.vue'), meta: { title: 'Session', auth: 'account' } },
    { path: '/team', component: () => import('@/views/TeamListView.vue'), meta: { title: 'Team', auth: 'account', tab: true } },
    { path: '/team/:id', component: () => import('@/views/TeamManageView.vue'), meta: { title: 'Team', auth: 'account' } },
    { path: '/team/:id/agenda', component: () => import('@/views/AgendaView.vue'), meta: { title: 'Schedule', auth: 'account' } },
    { path: '/team/:id/forms', component: () => import('@/views/EvaluationFormsView.vue'), meta: { title: 'Evaluation forms', auth: 'account' } },
    { path: '/team/:id/ranking', component: () => import('@/views/TeamRankingView.vue'), meta: { title: 'Compare archers', auth: 'account' } },
    { path: '/team/:id/progress', component: () => import('@/views/TeamProgressView.vue'), meta: { title: 'Team ratings', auth: 'account' } },
    { path: '/evaluate', component: () => import('@/views/EvaluationEditView.vue'), meta: { title: 'Evaluation', auth: 'account' } },
    { path: '/evaluations/:id', component: () => import('@/views/EvaluationView.vue'), meta: { title: 'Evaluation', auth: 'account' } },
    { path: '/archers/:id/evaluations', component: () => import('@/views/EvaluationListView.vue'), meta: { title: 'Evaluations', auth: 'account' } },
    { path: '/archers/:id/progress', component: () => import('@/views/ProgressView.vue'), meta: { title: 'Progress', auth: 'account' } },
    { path: '/archers/:id/details', component: () => import('@/views/ArcherDetailsView.vue'), meta: { title: 'Archer details', auth: 'account' } },
    { path: '/archers/:id', component: () => import('@/views/ArcherSessionsView.vue'), meta: { title: 'Archer', auth: 'account' } },
    { path: '/equipment', component: () => import('@/views/EquipmentListView.vue'), meta: { title: 'Equipment', auth: 'in' } },
    { path: '/equipment/bows/:id', component: () => import('@/views/BowView.vue'), meta: { title: 'Bow', auth: 'in' } },
    { path: '/equipment/arrow-sets/:id', component: () => import('@/views/ArrowSetView.vue'), meta: { title: 'Arrow set', auth: 'in' } },
    { path: '/sign-in', component: () => import('@/views/SignInView.vue'), meta: { title: 'Sign in', auth: 'out' } },
    { path: '/register', component: () => import('@/views/RegisterView.vue'), meta: { title: 'Join with invite code', auth: 'out' } },
    { path: '/reset-password', component: () => import('@/views/ResetPasswordView.vue'), meta: { title: 'Reset password', auth: 'out' } },
    { path: '/settings', component: () => import('@/views/SettingsView.vue'), meta: { title: 'Settings', auth: 'in', tab: true } },
    { path: '/settings/data', component: () => import('@/views/LocalDataView.vue'), meta: { title: 'Your data', auth: 'in' } },
    { path: '/settings/about', component: () => import('@/views/SettingsAboutView.vue'), meta: { title: 'About', auth: 'in' } },
    { path: '/settings/server', component: () => import('@/views/SettingsServerView.vue'), meta: { title: 'Server address' } },
    { path: '/:rest(.*)*', redirect: '/' },
  ],
})

router.beforeEach(async (to) => {
  await authReady()
  const { status } = useAuth()
  if (to.meta.auth === 'in' && status.value !== 'signedIn' && status.value !== 'local') return '/sign-in'
  if (to.meta.auth === 'account') {
    if (status.value === 'local') return '/'
    if (status.value !== 'signedIn') return '/sign-in'
  }
  if (to.meta.auth === 'out' && status.value === 'signedIn') return '/'
})

export default router
