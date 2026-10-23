import { ref, watch } from 'vue'

import { i18n, type Language } from '@/i18n'
import { localStore } from '@/lib/local-store'

export type LanguageMode = 'system' | Language

const KEY = 'language'
const mode = ref<LanguageMode>('system')

/** The phone's language if we have it, English otherwise. */
export function systemLanguage(preferred: readonly string[] = navigator.languages ?? [navigator.language]): Language {
  for (const tag of preferred) {
    const base = tag.toLowerCase().split('-')[0]
    if (base === 'de' || base === 'en') return base
  }
  return 'en'
}

function apply() {
  const language = mode.value === 'system' ? systemLanguage() : mode.value
  i18n.global.locale.value = language
  document.documentElement.lang = language
}

/** Applies the phone's language now and the saved choice once it is read. Call once at startup. */
export function initLanguage() {
  apply()
  watch(mode, apply)
  void localStore.get(KEY).then((saved) => {
    if (saved === 'system' || saved === 'en' || saved === 'de') mode.value = saved
  })
}

export function useLocale() {
  return {
    mode,
    setMode: (next: LanguageMode) => {
      mode.value = next
      void localStore.set(KEY, next)
    },
  }
}
