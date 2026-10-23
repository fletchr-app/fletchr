import { ref } from 'vue'

import { localStore } from '@/lib/local-store'

// "Number the arrows": a setting of this device. When on, the arrow entry offers the numbers of the arrow set.
const KEY = 'numberArrows'
const numbering = ref(false)
let started = false

export function useNumberArrows() {
  if (!started) {
    started = true
    void localStore.get(KEY).then((saved) => {
      if (saved === '1') numbering.value = true
    })
  }
  return {
    numbering,
    setNumbering(on: boolean) {
      numbering.value = on
      void localStore.set(KEY, on ? '1' : '0')
    },
  }
}
