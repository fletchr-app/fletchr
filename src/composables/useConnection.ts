import { App } from '@capacitor/app'
import { Network } from '@capacitor/network'
import { effectScope, ref, watch } from 'vue'

import { useServer } from '@/composables/useServer'
import { reachedServer, RECHECK_MS } from '@/lib/connection'

// Whether the server can be reached right now, for the red banner. Every API request reports its outcome (auth-session.ts);
// while the server cannot be reached, a health request every few seconds, when the app comes back to the front and when the
// network returns finds out when it is back. The device's own network going away counts at once.
const HEALTH_TIMEOUT_MS = 6000
const { url } = useServer()
const reachable = ref(true)
let timer: ReturnType<typeof setInterval> | null = null

/** The outcome of a request, from the API client. */
export const reportReachable = (reached: boolean) => (reachable.value = reached)

async function check() {
  try {
    const res = await fetch(`${url.value}/api/health/`, { signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) })
    reachable.value = reachedServer(res.status)
  } catch {
    reachable.value = false
  }
}

effectScope(true).run(() => {
  watch(reachable, (now) => {
    if (!now && timer === null) timer = setInterval(() => void check(), RECHECK_MS)
    if (now && timer !== null) (clearInterval(timer), (timer = null))
  })
  // Another server address starts from "reachable"; its first request says otherwise.
  watch(url, () => (reachable.value = true))
  void App.addListener('appStateChange', ({ isActive }) => isActive && !reachable.value && void check())
  void Network.addListener('networkStatusChange', ({ connected }) => (connected ? void check() : (reachable.value = false)))
})

export function useConnection() {
  return { reachable }
}
