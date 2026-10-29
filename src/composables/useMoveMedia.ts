import { useAuth } from '@/composables/useAuth'
import { useMedia } from '@/composables/useMedia'

/** What can be moved: a photo or video that waits on the phone, or one the server has. */
export type MoveItem = { id: string; queued: boolean }

/**
 * Put photos and videos into a session, or take them out (`session` null). Those still on the phone change in the queue, so
 * they are uploaded with the right session; the others are sent to the server one by one, and each is checked there.
 */
export function useMoveMedia() {
  const { api } = useAuth()
  const media = useMedia()

  async function move(items: MoveItem[], session: string | null): Promise<{ moved: number; failed: number }> {
    const queued = items.filter((i) => i.queued).map((i) => i.id)
    if (queued.length > 0) media.move(queued, session)
    let moved = queued.length
    let failed = 0
    for (const item of items.filter((i) => !i.queued)) {
      try {
        const { response } = await api.PUT('/api/media/{media_id}/', {
          params: { path: { media_id: item.id } },
          body: {},
          bodySerializer: () => {
            const form = new FormData()
            form.append('session', session ?? '')
            return form
          },
        })
        if (response.ok) moved++
        else failed++
      } catch {
        failed++
      }
    }
    return { moved, failed }
  }

  return { move }
}
