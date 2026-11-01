/** What a push notification carries (the server sends ids as strings, see server/push/notify.py). */
export type PushData = Record<string, unknown>;

export type PushContext = {
  /** The signed-in account, or null. */
  userId: number | null;
  /** Whether a session with this id is in the log on the phone (your own sessions are, other people's are not). */
  hasLocalSession: (id: string) => boolean;
};

/** An id from the server: a number or a uuid. Anything else is not put in a route. */
const ID = /^[A-Za-z0-9-]{1,40}$/;

function id(value: unknown): string | null {
  return typeof value === 'string' && ID.test(value) ? value : null;
}

/** The screen a tap on a notification opens, or null for none. A notification meant for another account on this phone is ignored. */
export function pushTarget(data: PushData, context: PushContext): string | null {
  if (context.userId === null || String(context.userId) !== data.user) return null;
  const media = id(data.media);
  const session = id(data.session);
  const event = id(data.event);
  const evaluation = id(data.evaluation);
  const team = id(data.team);
  switch (data.type) {
    case 'note':
      if (media) return `/media/${media}`;
      if (session) return context.hasLocalSession(session) ? `/training/${session}` : `/sessions/${session}`;
      if (event) return `/events/${event}`;
      return '/training';
    case 'evaluation':
      return evaluation ? `/evaluations/${evaluation}` : null;
    case 'team':
      return team ? `/team/${team}` : '/team';
    default:
      return null;
  }
}
