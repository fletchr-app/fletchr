import { CalendarPermissionScope, CapacitorCalendar } from '@ebarooni/capacitor-calendar';

import type { CalendarBackend, Entry, Instance, Window } from './device-calendar.ts';

// The phone's calendar through @ebarooni/capacitor-calendar (Android). Only this file knows the plugin, so a swap touches one file.
// The calendar is a local one (no Google account behind it) under a fixed account name, so it is found again after a reinstall.
export const ACCOUNT = 'fletchr';
const COLOR = '#1d3557';

export type Permission = 'granted' | 'denied' | 'prompt';

/** Both calendar permissions, as one answer. */
export async function permission(): Promise<Permission> {
  const [read, write] = await Promise.all([
    CapacitorCalendar.checkPermission({ scope: CalendarPermissionScope.READ_CALENDAR }),
    CapacitorCalendar.checkPermission({ scope: CalendarPermissionScope.WRITE_CALENDAR }),
  ]);
  if (read.result === 'granted' && write.result === 'granted') return 'granted';
  return read.result === 'denied' || write.result === 'denied' ? 'denied' : 'prompt';
}

export async function requestPermission(): Promise<boolean> {
  return (await CapacitorCalendar.requestFullCalendarAccess()).result === 'granted';
}

async function ours() {
  return (await CapacitorCalendar.listCalendars()).result.filter((calendar) => calendar.accountName === ACCOUNT);
}

/** Our calendar's id: the first one under our account name (a second one, from a crash, is deleted), or a new one. */
export async function findOrCreateCalendar(title: string): Promise<string> {
  const [first, ...extra] = await ours();
  for (const calendar of extra) await CapacitorCalendar.deleteCalendar({ id: calendar.id });
  if (first) return first.id;
  return (await CapacitorCalendar.createCalendar({ title, color: COLOR, accountName: ACCOUNT, ownerAccount: ACCOUNT })).id;
}

/** Remove our calendar and with it all the entries. */
export async function deleteCalendar(): Promise<void> {
  for (const calendar of await ours()) await CapacitorCalendar.deleteCalendar({ id: calendar.id });
}

export const nativeBackend: CalendarBackend = {
  async listInstances(calendarId: string, { from, to }: Window): Promise<Instance[]> {
    // The plugin lists every calendar on the phone and cannot filter
    const { result } = await CapacitorCalendar.listEventsInRange({ from, to });
    return result
      .filter((event) => event.calendarId === calendarId)
      .map((event) => ({ id: event.id, startDate: event.startDate, description: event.description }));
  },

  async create(calendarId: string, entry: Entry): Promise<void> {
    await CapacitorCalendar.createEvent({
      calendarId,
      title: entry.title,
      location: entry.location,
      description: entry.description,
      startDate: entry.start,
      endDate: entry.end,
      alerts: entry.alerts,
    });
  },

  async remove(id: string): Promise<void> {
    await CapacitorCalendar.deleteEvent({ id });
  },
};
