import { ref, watch } from 'vue'

import { localStore } from '@/lib/local-store'

export type ThemeMode = 'system' | 'light' | 'dark'

const KEY = 'theme'
const mode = ref<ThemeMode>('system')
const system = window.matchMedia('(prefers-color-scheme: dark)')

function apply() {
  const dark = mode.value === 'dark' || (mode.value === 'system' && system.matches)
  document.documentElement.setAttribute('data-bs-theme', dark ? 'dark' : 'light')
}

/** Applies the theme now (the system's) and again once the saved choice is read. Call once at startup. */
export function initTheme() {
  apply()
  system.addEventListener('change', apply) // also while the app is open
  watch(mode, apply)
  void localStore.get(KEY).then((saved) => {
    if (saved === 'light' || saved === 'dark' || saved === 'system') mode.value = saved
  })
}

export function useTheme() {
  return {
    mode,
    setMode: (next: ThemeMode) => {
      mode.value = next
      void localStore.set(KEY, next)
    },
  }
}
