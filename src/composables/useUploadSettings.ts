import { ref } from 'vue'

import { localStore } from '@/lib/local-store'

// How uploads behave on this device. A clip is tens of MB, so videos wait for Wi-Fi unless the person says otherwise;
// photos are small and always go at once.
const KEY = 'videosWifiOnly'
const videosWifiOnly = ref(true)
let started = false

export function useUploadSettings() {
  if (!started) {
    started = true
    void localStore.get(KEY).then((saved) => {
      if (saved === '0') videosWifiOnly.value = false
    })
  }
  return {
    videosWifiOnly,
    setVideosWifiOnly(on: boolean) {
      videosWifiOnly.value = on
      void localStore.set(KEY, on ? '1' : '0')
    },
  }
}
