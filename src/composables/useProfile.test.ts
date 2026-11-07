import assert from 'node:assert/strict'
import { afterEach, beforeEach, test, vi } from 'vitest'
import { effectScope, nextTick, ref, shallowRef } from 'vue'

// The profile has two sources: the device first for yourself, the server for an archer. The singletons it reads are replaced.
type AuthStatus = 'loading' | 'signedOut' | 'signedIn' | 'local'
const status = ref<AuthStatus>('local')
const userId = ref<string | null>(null)
const GET = vi.fn()
const storeOwner = ref<unknown>({ kind: 'local', id: 'x' })

const session = { id: 's1', started_at: new Date().toISOString(), ended_at: null, type: 'scoring', environment: 'indoor', location: 'Hall', ends: [], volume: [{ id: 'v1', distance_m: '18', arrow_count: 12 }] }
const bow = { uid: 'b1', is_active: true, values: { name: 'Shibuya', draw_weight: 38 } }
const queuedPhoto = { id: 'p1', kind: 'photo', owner: null, session: null, taken_at: '2026-10-01T10:00:00Z', width: 1, height: 1 }

vi.mock('@/composables/useAuth', () => ({
  useAuth: () => ({ api: { GET }, status, userId, isLocal: { get value() { return status.value === 'local' } }, storeOwner }),
}))
vi.mock('@/composables/useLog', () => ({ useLog: () => ({ sessions: shallowRef([session]), goneSessions: shallowRef(new Set()) }) }))
vi.mock('@/composables/useEquipment', () => ({ useEquipment: () => ({ bows: shallowRef([bow]), arrowSets: shallowRef([]) }) }))
vi.mock('@/composables/useMedia', () => ({ useMedia: () => ({ items: shallowRef([queuedPhoto]) }) }))
vi.mock('@/composables/useMediaLibrary', () => ({ useMediaLibrary: () => ({ items: shallowRef([]), thumbnails: ref({}) }) }))
vi.mock('@/composables/useNoteLibrary', () => ({ useNoteLibrary: () => ({ list: async () => [] }) }))
// The library asks the server first and falls back to its copy; the copy is empty here, so it is the server's answer or the failure.
vi.mock('@/composables/useEvaluationLibrary', () => ({
  useEvaluationLibrary: () => ({ list: async (query: unknown) => (await GET('/api/evaluations/', { params: { query } })).data ?? null }),
}))
vi.mock('@/composables/useTeams', () => ({ useTeams: () => ({ teams: ref([]), loaded: ref(false), load: async () => {} }) }))
vi.mock('@/composables/useTrainingVisibility', () => ({ useTrainingVisibility: () => ({ visibility: ref('me') }) }))
vi.mock('@/composables/useArcherSessions', () => ({ useArcherSessions: () => ({ rows: ref([]), error: ref(null), loading: ref(false) }) }))
vi.mock('@/lib/local-store', () => ({ localStore: { get: async () => null, set: async () => {} } }))
vi.mock('@/lib/media-files', () => ({ loadThumbnail: async () => new Blob(['x']) }))

const settle = async () => {
  await nextTick()
  await new Promise((resolve) => setTimeout(resolve, 0))
}

beforeEach(() => {
  GET.mockReset()
  status.value = 'local'
  userId.value = null
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:thumb', revokeObjectURL: () => {} }))
})
afterEach(() => vi.unstubAllGlobals())

async function ownProfile() {
  const { useOwnProfile } = await import('./useProfile')
  const scope = effectScope()
  const data = scope.run(() => useOwnProfile())!
  await settle()
  return { data, scope }
}

test('yourself without an account: everything comes from the device and the server is not asked', async () => {
  const { data, scope } = await ownProfile()
  assert.equal(GET.mock.calls.length, 0)
  assert.equal(data.own, true)
  assert.equal(data.sessions.length, 1)
  assert.equal(data.bow?.name, 'Shibuya')
  assert.equal(data.volume?.total, 12)
  assert.deepEqual(data.tiles.map((t) => [t.id, t.to]), [['p1', '/local-media/p1']])
  assert.equal(data.evaluations, null)
  scope.stop()
})

test('yourself signed in but offline: the device parts are there, the evaluations are a quiet failure', async () => {
  status.value = 'signedIn'
  userId.value = '7'
  GET.mockRejectedValue(new Error('offline'))
  const { data, scope } = await ownProfile()
  assert.equal(data.sessions.length, 1)
  assert.equal(data.bow?.name, 'Shibuya')
  assert.equal(data.volume?.total, 12)
  assert.equal(data.tiles.length, 1)
  assert.equal(data.evaluations, null)
  assert.ok(data.evaluationsError)
  scope.stop()
})

test('signing out while the screen lives drops what the account loaded', async () => {
  status.value = 'signedIn'
  userId.value = '7'
  GET.mockImplementation(async (path: string) => ({ data: path === '/api/me/' ? { id: 7, email: 'a@b.c', profile: { name: 'Anna' } } : [] }))
  const { data, scope } = await ownProfile()
  assert.equal(data.name, 'Anna')
  status.value = 'local'
  userId.value = null
  await settle()
  assert.equal(data.name, '')
  assert.equal(data.evaluations, null)
  scope.stop()
})

test('an archer: the server is asked for their data by id', async () => {
  GET.mockResolvedValue({ data: [] })
  const { useArcherProfile } = await import('./useProfile')
  const scope = effectScope()
  const data = scope.run(() => useArcherProfile(42, 'Bea'))!
  await settle()
  assert.equal(data.own, false)
  assert.equal(data.name, 'Bea')
  const owners = GET.mock.calls.map(([path, options]) => [path, options?.params?.query?.owner ?? options?.params?.query?.archer ?? options?.params?.path?.user_id])
  for (const path of ['/api/bows/', '/api/arrow-sets/', '/api/media/', '/api/stats/', '/api/evaluations/', '/api/archers/{user_id}/']) {
    assert.ok(owners.some(([p, id]) => p === path && id === 42), `${path} asked for 42`)
  }
  scope.stop()
})
