import assert from 'node:assert/strict'
import { ref } from 'vue'
import { beforeEach, test, vi } from 'vitest'

// Who sees a clip that is in no session: queued clips change in the queue, clips on the server are sent there.
const PUT = vi.fn()
const setVisibility = vi.fn()
const fallback = ref<'me' | 'coaches'>('coaches')

vi.mock('@/composables/useAuth', () => ({ useAuth: () => ({ api: { PUT } }) }))
vi.mock('@/composables/useMedia', () => ({ useMedia: () => ({ setVisibility }) }))
vi.mock('@/composables/useTrainingVisibility', () => ({ useTrainingVisibility: () => ({ visibility: fallback }) }))
vi.mock('@/i18n', () => ({ t: (key: string) => key }))

beforeEach(() => {
  PUT.mockReset()
  setVisibility.mockReset()
  fallback.value = 'coaches'
})

test('a clip without a value of its own shows the default from Settings', async () => {
  const { useClipVisibility } = await import('./useClipVisibility')
  const { effective } = useClipVisibility()
  assert.equal(effective('a', null), 'coaches')
  assert.equal(effective('a', ''), 'coaches')
  fallback.value = 'me'
  assert.equal(effective('a', undefined), 'me')
  assert.equal(effective('a', 'coaches'), 'coaches')
})

test('a queued clip changes in the queue and shows the choice at once', async () => {
  const { useClipVisibility } = await import('./useClipVisibility')
  const { save, effective, error } = useClipVisibility()
  await save({ id: 'q1', queued: true }, 'me')
  assert.deepEqual(setVisibility.mock.calls, [['q1', 'me']])
  assert.equal(PUT.mock.calls.length, 0)
  assert.equal(effective('q1', undefined), 'me')
  assert.equal(error.value, '')
})

test('a clip on the server is sent there as form data, and the choice shows once it is saved', async () => {
  PUT.mockResolvedValue({ response: { ok: true } })
  const { useClipVisibility } = await import('./useClipVisibility')
  const { save, effective } = useClipVisibility()
  await save({ id: 'm1', queued: false }, 'me')
  const options = PUT.mock.calls[0]![1]
  assert.deepEqual(options.params, { path: { media_id: 'm1' } })
  assert.equal(options.bodySerializer().get('visibility'), 'me')
  assert.equal(effective('m1', 'coaches'), 'me')
})

test('a refused or unreachable server leaves the choice as it was and says so', async () => {
  const { useClipVisibility } = await import('./useClipVisibility')
  const { save, effective, error } = useClipVisibility()
  PUT.mockResolvedValue({ response: { ok: false } })
  await save({ id: 'm1', queued: false }, 'me')
  assert.equal(error.value, 'visibility.clipFailed')
  assert.equal(effective('m1', 'coaches'), 'coaches')
  PUT.mockRejectedValue(new TypeError('Failed to fetch'))
  await save({ id: 'm1', queued: false }, 'me')
  assert.equal(error.value, 'visibility.clipFailed')
  assert.equal(effective('m1', 'coaches'), 'coaches')
})
