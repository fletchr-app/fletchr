import { computed, effectScope, ref, watch } from 'vue'

import { useAuth } from '@/composables/useAuth'
import { useKeyedStore } from '@/composables/useKeyedStore'
import { storeKey } from '@/lib/store-owner'

// An evaluation that is being filled in survives a walk to the player to choose a frame or a photo: the form is left and comes back.
// It is also kept on the phone while it is typed (#84), so that closing the app does not lose it.
export type Row = { rating: number | null; comment: string; media: string | null; frame: number | null; timeMs: number | null }
export type Draft = { key: string; templateId: number | null; teamId: number | null; date: string; comment: string; goals: string; visibility: 'shared' | 'coach_only'; rows: Record<string, Row> }

export const emptyRow = (): Row => ({ rating: null, comment: '', media: null, frame: null, timeMs: null })

const draft = ref<Draft | null>(null)
/** Set while the person is choosing a frame for a criterion: where to come back to, and whose clips. */
const picking = ref<{ criterion: string; archer: number; returnTo: string } | null>(null)
const picked = ref<{ criterion: string; media: string; frame: number | null; timeMs: number | null } | null>(null)

const { storeOwner } = useAuth()
// Only for an account: without one there are no evaluations.
const storageKey = computed(() => (storeOwner.value?.kind === 'account' ? storeKey('evaluation-draft', storeOwner.value) : null))
const keyed = effectScope(true).run(() =>
  useKeyedStore<{ draft: Draft | null }>({
    key: storageKey,
    empty: { draft: null },
    read: () => ({ draft: draft.value }),
    apply: (value) => (draft.value = value.draft ?? null),
    changes: () => JSON.stringify(draft.value),
    resetOnKeyChange: true,
  }),
)!
const { loaded } = keyed

/** Resolves once the draft kept on the phone is in memory, so a form does not start a new one over it. */
function ready(): Promise<void> {
  if (loaded.value || storageKey.value === null) return Promise.resolve()
  return new Promise((resolve) => {
    const stop = watch([loaded, storageKey], ([isLoaded, key]) => {
      if (isLoaded || key === null) {
        stop()
        resolve()
      }
    })
  })
}

export function useEvaluationDraft() {
  return {
    draft,
    picking,
    picked,
    ready,
    clear() {
      draft.value = null
      picking.value = null
      picked.value = null
    },
    startPick(criterion: string, archer: number, returnTo: string) {
      picking.value = { criterion, archer, returnTo }
      picked.value = null
    },
    /** The frame (or, with frame and time null, the photo) is chosen: remember it and say where to go back to. */
    finishPick(media: string, frame: number | null, timeMs: number | null): string | null {
      const p = picking.value
      if (!p) return null
      picked.value = { criterion: p.criterion, media, frame, timeMs }
      picking.value = null
      return p.returnTo
    },
    cancelPick() {
      picking.value = null
    },
  }
}
