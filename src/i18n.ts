import { createI18n } from 'vue-i18n'

import de from '@/locales/de'
import en from '@/locales/en'

export type Language = 'en' | 'de'

// English is the source and the fallback: a text missing in German shows in English, never as a key.
export const i18n = createI18n({ legacy: false, locale: 'en', fallbackLocale: 'en', messages: { en, de } })

/** The language the texts are in now, also sent to the server (Accept-Language) so its messages match. */
export const currentLanguage = (): Language => i18n.global.locale.value as Language

/** For code that is not a component (alerts, messages built in functions). */
export const t = i18n.global.t
