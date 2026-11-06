import assert from 'node:assert/strict'
import { ref } from 'vue'
import { beforeEach, test, vi } from 'vitest'

// useAuth is a module-level singleton: every test loads a fresh copy (`vi.resetModules`) with the session, the server address
// and the storage replaced, so the sign-out sequence can be checked without Capacitor or a server.
const disk = new Map<string, string>()
const calls: string[] = []
const POST = vi.fn()
let tokens: { access: string; refresh: string } | null = null
let listener: () => void = () => {}

const jwt = (payload: Record<string, unknown>) => `h.${btoa(JSON.stringify(payload))}.s`
const ACCOUNT_KEY = 'log:https://server:7'

vi.mock('@/lib/auth-session', () => ({
  AuthSession: class {
    api = { POST, GET: vi.fn() }
    getState = () => ({ loaded: true, tokens })
    subscribe = (fn: () => void) => ((listener = fn), () => {})
    setTokens(next: typeof tokens) {
      // Local mode must already be on, so the app never shows a signed-out state.
      calls.push(`setTokens(${next ? 'tokens' : 'null'}) with local mode ${disk.get('local-mode') === '1' ? 'on' : 'off'}`)
      tokens = next
      listener()
    }
  },
}))
vi.mock('@/composables/useServer', () => ({ useServer: () => ({ url: ref('https://server'), isOverride: ref(false), setUrl: () => {} }) }))
vi.mock('@/composables/useConnection', () => ({ reportReachable: () => {} }))
vi.mock('@/lib/social-login', () => ({ GOOGLE_WEB_CLIENT_ID: '', googleIdToken: async () => null }))
vi.mock('@/lib/uuid', () => ({ newId: () => 'local-owner' }))
vi.mock('@/lib/local-store', () => ({
  localStore: {
    get: async (key: string) => disk.get(key) ?? null,
    set: async (key: string, value: string) => void disk.set(key, value),
    remove: async (key: string) => void disk.delete(key),
  },
}))

beforeEach(() => {
  vi.resetModules()
  disk.clear()
  calls.length = 0
  POST.mockReset()
  POST.mockResolvedValue({ response: { ok: true } })
  tokens = { access: jwt({ user_id: '7' }), refresh: 'refresh-token' }
  disk.set(ACCOUNT_KEY, '[{"id":"a"}]')
  disk.set('local-owner-id', 'local-owner')
})

test('sign-out runs the hooks, starts local mode, then drops the tokens and revokes them', async () => {
  const { useAuth, addBeforeSignOut, authReady } = await import('./useAuth')
  addBeforeSignOut(async () => void calls.push('hook 1'))
  addBeforeSignOut(async () => {
    calls.push('hook 2 (fails)')
    throw new Error('offline')
  })
  addBeforeSignOut(async () => void calls.push('hook 3'))
  await authReady()
  const { signOut, status, storeOwner } = useAuth()
  assert.equal(status.value, 'signedIn')
  assert.deepEqual(storeOwner.value, { kind: 'account', server: 'https://server', userId: '7' })

  await signOut()

  // A failing hook does not stop the rest, and local mode is on before the tokens go.
  assert.deepEqual(calls, ['hook 1', 'hook 2 (fails)', 'hook 3', 'setTokens(null) with local mode on'])
  assert.equal(POST.mock.calls[0]![0], '/api/token/blacklist/')
  assert.deepEqual(POST.mock.calls[0]![1], { body: { refresh: 'refresh-token' } })
  assert.equal(status.value, 'local')
  assert.deepEqual(storeOwner.value, { kind: 'local', id: 'local-owner' })
})

test('sign-out leaves the data of the account on the phone', async () => {
  const { useAuth, authReady } = await import('./useAuth')
  await authReady()
  await useAuth().signOut()
  assert.equal(disk.get(ACCOUNT_KEY), '[{"id":"a"}]')
  assert.equal(disk.get('local-owner-id'), 'local-owner')
})

test('sign-out still works when revoking the token fails (no connection)', async () => {
  POST.mockRejectedValue(new TypeError('Failed to fetch'))
  const { useAuth, authReady } = await import('./useAuth')
  await authReady()
  const { signOut, status } = useAuth()
  await signOut()
  assert.equal(status.value, 'local')
})
