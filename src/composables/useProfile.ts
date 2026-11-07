import { computed, onScopeDispose, reactive, ref, watch } from 'vue'

import { useArcherSessions } from '@/composables/useArcherSessions'
import { useAuth } from '@/composables/useAuth'
import { useEquipment } from '@/composables/useEquipment'
import { useEvaluationLibrary } from '@/composables/useEvaluationLibrary'
import { useLog } from '@/composables/useLog'
import { useMedia } from '@/composables/useMedia'
import { useMediaLibrary } from '@/composables/useMediaLibrary'
import { useNoteLibrary } from '@/composables/useNoteLibrary'
import { useRemote } from '@/composables/useRemote'
import { useTeams } from '@/composables/useTeams'
import { useTrainingVisibility } from '@/composables/useTrainingVisibility'
import { t } from '@/i18n'
import type { components } from '@/lib/api-types'
import { loadThumbnail } from '@/lib/media-files'
import { type GearItem, ageOn, currentGear, latestTiles, timeZone, type Tile } from '@/lib/profile'
import { localStore } from '@/lib/local-store'
import { sessionRows, type SessionRow } from '@/lib/session-rows'
import { computeStats, fromLog, type StatsResult } from '@/lib/stats'
import { storeKey } from '@/lib/store-owner'

type Archer = components['schemas']['Archer']
type Evaluation = components['schemas']['Evaluation']
type Team = components['schemas']['Team']

const REFRESH_MS = 10000
const TILES = 6

export type ProfileNote = { created_at: string; body: string; author_name?: string }

/** Everything the profile component shows. The two sources below fill it: the device first for yourself, the server for an archer. */
export type ProfileData = {
  own: boolean
  /** The archer's id; null for yourself without an account. */
  id: number | null
  name: string
  avatarUrl: string
  avatarAllowed: boolean
  profileLine: string
  consent: string
  managed: boolean
  /** The archer as the server describes them (a coach's view only), for the menu. */
  archer: Archer | null
  sessions: SessionRow[]
  sessionsLoading: boolean
  sessionsError: string | null
  bow?: GearItem
  arrows?: GearItem
  gearLoaded: boolean
  gearError: string | null
  evaluations: Evaluation[] | null
  evaluationsError: string | null
  volume: StatsResult['volume'] | null
  statsError: string | null
  tiles: Tile[]
  tilesLoaded: boolean
  tilesError: string | null
  latestNote: ProfileNote | undefined
  notesLoaded: boolean
  teams: Team[]
  teamsLoaded: boolean
  canEvaluate: boolean
  canNote: boolean
  reloadArcher: () => void
  /** Fetch everything that comes from the server again. */
  reload: () => void
}

const side = (v: string | undefined) => (v === 'right' ? t('account.right') : v === 'left' ? t('account.left') : '')
function lineOf(hand: string | undefined, eye: string | undefined, age: number | null | undefined) {
  return [hand && t('archer.handIs', { side: side(hand) }), eye && t('archer.eyeIs', { side: side(eye) }), age !== null && age !== undefined && t('archer.ageIs', { n: age })].filter(Boolean).join(' · ')
}

/** An archer as their coach sees them: everything from the server, polled as before. */
export function useArcherProfile(id: number, fallbackName = ''): ProfileData {
  const { api } = useAuth()
  const info = useRemote(async () => (await api.GET('/api/archers/{user_id}/', { params: { path: { user_id: id } } })).data ?? null)
  const sessions = useArcherSessions(id)
  const bows = useRemote(async () => (await api.GET('/api/bows/', { params: { query: { owner: id } } })).data ?? null)
  const arrowSets = useRemote(async () => (await api.GET('/api/arrow-sets/', { params: { query: { owner: id } } })).data ?? null)
  const evaluations = useRemote(async () => (await api.GET('/api/evaluations/', { params: { query: { archer: id } } })).data ?? null)
  const stats = useRemote(async () => (await api.GET('/api/stats/', { params: { query: { owner: id, tz: timeZone(), weeks: 1 } } })).data ?? null)
  const media = useRemote(async () => (await api.GET('/api/media/', { params: { query: { owner: id } } })).data ?? null)
  const writable = useRemote(async () => (await api.GET('/api/notes/teams/', { params: { query: { archer: id } } })).data ?? null)
  const noteLibrary = useNoteLibrary()
  const notes = useRemote(async () => noteLibrary.list({ archer: id }), { pollMs: REFRESH_MS, keepPolling: () => true })

  const archer = computed(() => info.data.value)
  const underage = computed(() => archer.value?.age !== null && archer.value?.age !== undefined && archer.value.age < 18)
  const gear = computed(() => currentGear((bows.data.value ?? []) as never[], (arrowSets.data.value ?? []) as never[]))
  const tiles = computed<Tile[]>(() =>
    (media.data.value ?? []).slice(0, TILES).map((m) => ({ id: m.id, kind: m.kind, src: m.thumbnail_url, queued: false, to: `/media/${m.id}?owner=${id}` })),
  )
  const latestNote = computed(() => [...(notes.data.value ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at))[0])

  return reactive({
    own: false,
    id,
    name: computed(() => archer.value?.name || fallbackName),
    avatarUrl: computed(() => archer.value?.avatar_url ?? ''),
    avatarAllowed: computed(() => archer.value?.avatar_allowed ?? true),
    profileLine: computed(() => lineOf(archer.value?.dominant_hand, archer.value?.dominant_eye, archer.value?.age)),
    consent: computed(() => {
      const a = archer.value
      if (!a || !underage.value) return ''
      return a.video_consent_at
        ? t('consent.given', { who: a.video_consent_by ?? '', date: new Date(a.video_consent_at).toLocaleDateString() })
        : t('consent.missing', { name: a.name })
    }),
    managed: computed(() => !!archer.value?.managed),
    archer,
    sessions: sessions.rows,
    sessionsLoading: sessions.loading,
    sessionsError: sessions.error,
    bow: computed(() => gear.value.bow),
    arrows: computed(() => gear.value.arrows),
    gearLoaded: computed(() => !bows.loading.value && !arrowSets.loading.value),
    gearError: computed(() => bows.error.value || arrowSets.error.value),
    evaluations: evaluations.data,
    evaluationsError: evaluations.error,
    volume: computed(() => stats.data.value?.volume ?? null),
    statsError: stats.error,
    tiles,
    tilesLoaded: computed(() => !!media.data.value),
    tilesError: media.error,
    latestNote,
    notesLoaded: computed(() => !!notes.data.value),
    teams: [] as Team[],
    teamsLoaded: false,
    canEvaluate: computed(() => !!writable.data.value?.length),
    canNote: computed(() => !!writable.data.value?.length),
    reloadArcher: () => info.reload(),
    reload: () => [info, bows, arrowSets, evaluations, stats, media, writable, notes].forEach((r) => r.reload()),
  }) as ProfileData
}

/**
 * Yourself, device first: sessions, equipment, photos and the numbers come from the phone, so the page works without a connection
 * and without an account. Only the picture, the profile line, the evaluations, the coach notes and the teams need the server.
 * The screen stays alive across sign-in and sign-out, so everything follows `status` and `userId`.
 */
export function useOwnProfile(): ProfileData {
  const { api, userId, status, isLocal, storeOwner } = useAuth()
  const signedIn = computed(() => status.value === 'signedIn')
  const me = computed(() => (signedIn.value && userId.value !== null ? Number(userId.value) : null))

  // From the server, only with an account; what an earlier account left is not shown.
  const fromServer = <T>(load: (id: number) => Promise<T | null>) => {
    const remote = useRemote<T>(async () => (me.value === null ? null : load(me.value)), { watch: [me] })
    return {
      data: computed(() => (me.value === null ? null : remote.data.value)),
      error: computed(() => (me.value === null ? null : remote.error.value)),
      loading: computed(() => me.value !== null && remote.loading.value),
      reload: remote.reload,
    }
  }

  const noteLibrary = useNoteLibrary()
  const profile = fromServer(async () => (await api.GET('/api/me/')).data ?? null)
  // The server's list, or the copy on the phone without a connection (what is about you and what you wrote).
  const evaluationLibrary = useEvaluationLibrary()
  const evaluations = fromServer(async (id) => await evaluationLibrary.list({ archer: id }))
  const sharedNotes = useRemote(async () => (me.value === null ? [] : ((await noteLibrary.list({ archer: me.value, visibility: 'shared' })) ?? [])), { watch: [me] })
  const remoteSessions = fromServer(async (id) => (await api.GET('/api/sessions/', { params: { query: { owner: id } } })).data ?? null)
  const { teams, loaded: teamsLoaded, load: loadTeams } = useTeams()

  // The name is kept on the device, so the title shows it offline.
  const cachedName = ref('')
  const nameKey = computed(() => (storeOwner.value && !isLocal.value ? storeKey('profile', storeOwner.value) : null))
  watch(
    nameKey,
    async (key) => {
      cachedName.value = ''
      if (key) cachedName.value = (await localStore.get(key).catch(() => null)) ?? ''
    },
    { immediate: true },
  )
  const name = computed(() => (me.value === null ? '' : profile.data.value ? profile.data.value.profile.name || profile.data.value.email : cachedName.value))
  watch(profile.data, (loaded) => {
    const key = nameKey.value
    if (loaded && key) void localStore.set(key, loaded.profile.name || loaded.email).catch(() => {})
  })

  // The device.
  const { sessions: logged, goneSessions } = useLog()
  const { visibility: defaultVisibility } = useTrainingVisibility()
  const own = computed(() => logged.value.filter((s) => !s.owner))
  const rows = computed(() => sessionRows(own.value, remoteSessions.data.value ?? [], goneSessions.value, [], undefined, isLocal.value ? undefined : defaultVisibility.value))
  const { bows, arrowSets } = useEquipment()
  const gear = computed(() => currentGear(bows.value as never[], arrowSets.value as never[]))
  const volume = computed(() => computeStats(fromLog(own.value).sessions, new Date().toISOString(), timeZone(), 1).volume)

  // Photos: the upload queue (its thumbnails are files on the device), then the list the server gave.
  const media = useMedia()
  const library = useMediaLibrary()
  const queued = computed(() => media.items.value.filter((i) => i.owner === null || i.owner === me.value))
  const previews = ref<Record<string, string>>({})
  const tiles = computed(() =>
    latestTiles(queued.value, library.items.value, (id, isQueued) => (isQueued ? (previews.value[id] ?? '') : (library.thumbnails.value[id] ?? '')), isLocal.value, TILES),
  )
  watch(
    () => tiles.value.filter((tile) => tile.queued && previews.value[tile.id] === undefined).map((tile) => tile.id),
    (ids) =>
      ids.forEach((id) => {
        previews.value = { ...previews.value, [id]: '' } // so it is loaded once
        loadThumbnail(id)
          .then((blob) => (previews.value = { ...previews.value, [id]: URL.createObjectURL(blob) }))
          .catch(() => {})
      }),
    { immediate: true },
  )
  onScopeDispose(() => Object.values(previews.value).forEach((url) => url && URL.revokeObjectURL(url)))

  const latestNote = computed(() => [...(sharedNotes.data.value ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at))[0])

  // The evaluations need a connection; the page says so quietly instead of showing an error.
  const age = computed(() => ageOn(profile.data.value?.profile.date_of_birth, new Date()))

  return reactive({
    own: true,
    id: me,
    name,
    avatarUrl: computed(() => profile.data.value?.profile.avatar_url ?? ''),
    avatarAllowed: computed(() => profile.data.value?.profile.avatar_allowed ?? true),
    profileLine: computed(() => lineOf(profile.data.value?.profile.dominant_hand, profile.data.value?.profile.dominant_eye, age.value)),
    consent: '',
    managed: false,
    archer: null,
    sessions: rows,
    sessionsLoading: computed(() => remoteSessions.loading.value && rows.value.length === 0),
    sessionsError: computed(() => (rows.value.length ? null : remoteSessions.error.value)),
    bow: computed(() => gear.value.bow),
    arrows: computed(() => gear.value.arrows),
    gearLoaded: true,
    gearError: null,
    evaluations: evaluations.data,
    evaluationsError: evaluations.error,
    volume,
    statsError: null,
    tiles,
    tilesLoaded: true,
    tilesError: null,
    latestNote,
    notesLoaded: computed(() => me.value !== null && !!sharedNotes.data.value),
    teams: computed(() => (me.value === null ? [] : teams.value)),
    teamsLoaded: computed(() => me.value !== null && teamsLoaded.value),
    canEvaluate: false,
    canNote: false,
    reloadArcher: () => profile.reload(),
    reload: () => {
      profile.reload()
      evaluations.reload()
      remoteSessions.reload()
      sharedNotes.reload()
      void loadTeams()
    },
  }) as ProfileData
}
