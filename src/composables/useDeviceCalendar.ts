import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { effectScope, ref, watch } from 'vue'

import { useAuth } from '@/composables/useAuth'
import { t } from '@/i18n'
import { type Texts, syncCalendar } from '@/lib/device-calendar'
import { deleteCalendar, findOrCreateCalendar, nativeBackend, permission, requestPermission } from '@/lib/device-calendar-native'
import { localStore } from '@/lib/local-store'

// The trainings and events of your teams in a calendar the app owns on the phone (Android, #107): see
// specs/plans/2026-10-31-device-calendar.md. The phone's calendar holds the state, so this only keeps the setting.
const DAY_MS = 86_400_000
const AHEAD_DAYS = 119 // the agenda gives at most 120 days
const MIN_INTERVAL_MS = 15 * 60_000
const ENABLED_KEY = 'deviceCalendar'
const REMINDER_KEY = 'deviceCalendarReminder'

export type CalendarStatus = 'off' | 'syncing' | 'ok' | 'noPermission' | 'offline' | 'error'
/** Minutes before the start; 0 for none. */
export const REMINDER_CHOICES = [0, 30, 60, 1440] as const

const { api, status: authStatus } = useAuth()

const supported = Capacitor.getPlatform() === 'android'
const enabled = ref(false)
const reminder = ref(0)
const status = ref<CalendarStatus>('off')
const lastSync = ref<number | null>(null)

let running: Promise<void> | null = null
let queued = false

const texts = (): Texts => ({
  training: t('event.kind.training'),
  kind: { training: t('event.kind.training'), competition: t('event.kind.competition'), camp: t('event.kind.camp') },
  note: (team) => t('deviceCalendar.entryNote', { team }),
})

async function run(): Promise<void> {
  if ((await permission()) !== 'granted') {
    status.value = 'noPermission'
    return
  }
  status.value = 'syncing'
  const from = Date.now() - DAY_MS
  const window = { from, to: from + AHEAD_DAYS * DAY_MS }
  try {
    const [slots, agenda] = await Promise.all([
      api.GET('/api/slots/'),
      api.GET('/api/events/agenda/', { params: { query: { from: new Date(window.from).toISOString(), to: new Date(window.to).toISOString() } } }),
    ])
    if (!slots.data || !agenda.data) {
      status.value = 'offline'
      return
    }
    const teamNames = new Map(agenda.data.map((item) => [item.team, item.team_name]))
    const calendarId = await findOrCreateCalendar(t('deviceCalendar.calendarName'))
    await syncCalendar(nativeBackend, calendarId, { slots: slots.data, agenda: agenda.data, teamNames, texts: texts(), window, reminder: reminder.value })
    lastSync.value = Date.now()
    status.value = 'ok'
  } catch (e) {
    status.value = e instanceof TypeError ? 'offline' : 'error' // fetch fails with a TypeError when there is no network
  }
}

/** Bring the phone's calendar in line with the schedule. Not more often than every 15 minutes unless `force`; one at a time, so two runs never make duplicates. */
async function sync(force = false): Promise<void> {
  if (!supported || !enabled.value || authStatus.value !== 'signedIn') return
  if (!force && lastSync.value && Date.now() - lastSync.value < MIN_INTERVAL_MS) return
  if (running) {
    queued = true // whatever changed meanwhile is picked up by one more run after this one
    return running
  }
  running = run().finally(() => {
    running = null
  })
  await running
  if (queued) {
    queued = false
    await sync(true)
  }
}

/** Turn on: ask for the permission, make the calendar, fill it. False when the permission was refused. */
async function enable(): Promise<boolean> {
  if (!supported) return false
  if (!(await requestPermission())) {
    status.value = 'noPermission'
    return false
  }
  enabled.value = true
  void localStore.set(ENABLED_KEY, '1')
  await sync(true)
  return true
}

/** Turn off: the calendar goes with all its entries. */
async function disable(): Promise<void> {
  enabled.value = false
  status.value = 'off'
  lastSync.value = null
  void localStore.remove(ENABLED_KEY)
  try {
    if ((await permission()) === 'granted') await deleteCalendar()
  } catch {
    // Nothing to remove, or the calendar is already gone
  }
}

async function setReminder(minutes: number): Promise<void> {
  reminder.value = minutes
  void localStore.set(REMINDER_KEY, String(minutes))
  await sync(true)
}

let started = false
function start() {
  if (started || !supported) return
  started = true
  void Promise.all([localStore.get(ENABLED_KEY), localStore.get(REMINDER_KEY)]).then(([on, minutes]) => {
    reminder.value = Number(minutes) || 0
    if (on === '1') enabled.value = true
    void sync(true)
  })
  void App.addListener('appStateChange', ({ isActive }) => isActive && void sync())
  effectScope(true).run(() =>
    watch(authStatus, (s, was) => {
      // Signed out (or the session ended): the next account on this phone must not see this team's trainings
      if (was === 'signedIn' && s !== 'signedIn' && enabled.value) void disable()
      if (s === 'signedIn') void sync(true)
    }),
  )
}

export function useDeviceCalendar() {
  start()
  return { supported, enabled, reminder, status, lastSync, enable, disable, setReminder, sync }
}
