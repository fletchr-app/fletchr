import { ref, watch } from 'vue'

import { useAuth } from '@/composables/useAuth'
import { localStore } from '@/lib/local-store'
import { distanceField, distanceUnit, formatDistance, formatLength, isUnits, parseDistance, type Units } from '@/lib/units'

// The units of the profile (metric or imperial). Kept on the device too, so the screens use them without a connection.
const KEY = 'units'
const PENDING = 'unitsPending' // set when the choice could not be sent yet
const units = ref<Units>('metric')
let started = false

export function useUnits() {
  const { api, status } = useAuth()

  function setUnits(next: Units) {
    units.value = next
    void localStore.set(KEY, next)
  }

  // Send a choice that is still waiting, then read the server's setting.
  async function sync() {
    try {
      if ((await localStore.get(PENDING)) === '1') {
        const { data } = await api.PATCH('/api/me/', { body: { profile: { units: units.value } } })
        if (!data) return
        await localStore.remove(PENDING)
      }
      const { data } = await api.GET('/api/me/')
      if (data && isUnits(data.profile.units)) setUnits(data.profile.units)
    } catch {
      // Offline: the saved setting stays, and is sent next time.
    }
  }

  /** The user's choice: used at once, saved on the profile when there is a connection. */
  async function saveUnits(next: Units) {
    setUnits(next)
    await localStore.set(PENDING, '1')
    void sync()
  }

  if (!started) {
    started = true
    void localStore.get(KEY).then((saved) => {
      if (isUnits(saved)) units.value = saved
    })
    // Whoever signs in brings their own setting.
    watch(status, (s) => s === 'signedIn' && void sync(), { immediate: true })
  }

  return {
    units,
    setUnits,
    saveUnits,
    distanceUnit: () => distanceUnit(units.value),
    formatDistance: (metres: number | string) => formatDistance(metres, units.value),
    distanceField: (metres: number | string) => distanceField(metres, units.value),
    parseDistance: (text: string) => parseDistance(text, units.value),
    formatLength: (cm: number) => formatLength(cm, units.value),
  }
}
