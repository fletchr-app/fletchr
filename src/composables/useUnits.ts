import { ref, watch } from 'vue'

import { useAuth } from '@/composables/useAuth'
import { localStore } from '@/lib/local-store'
import { distanceField, distanceUnit, formatDistance, formatLength, isUnits, parseDistance, type Units } from '@/lib/units'

// The units of the profile (metric or imperial). Kept on the device too, so the screens use them without a connection.
const KEY = 'units'
const units = ref<Units>('metric')
let started = false

export function useUnits() {
  const { api, status } = useAuth()

  function setUnits(next: Units) {
    units.value = next
    void localStore.set(KEY, next)
  }

  if (!started) {
    started = true
    void localStore.get(KEY).then((saved) => {
      if (isUnits(saved)) units.value = saved
    })
    // Whoever signs in brings their own setting.
    watch(
      status,
      async (s) => {
        if (s !== 'signedIn') return
        try {
          const { data } = await api.GET('/api/me/')
          if (data && isUnits(data.profile.units)) setUnits(data.profile.units)
        } catch {
          // Offline: the saved setting stays.
        }
      },
      { immediate: true },
    )
  }

  return {
    units,
    setUnits,
    distanceUnit: () => distanceUnit(units.value),
    formatDistance: (metres: number | string) => formatDistance(metres, units.value),
    distanceField: (metres: number | string) => distanceField(metres, units.value),
    parseDistance: (text: string) => parseDistance(text, units.value),
    formatLength: (cm: number) => formatLength(cm, units.value),
  }
}
