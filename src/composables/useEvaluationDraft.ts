import { ref } from 'vue'

// An evaluation that is being filled in survives a walk to the player to choose a frame: the form is left and comes back.
export type Row = { rating: number | null; comment: string; media: string | null; frame: number | null; timeMs: number | null }
export type Draft = { key: string; templateId: number | null; teamId: number | null; date: string; comment: string; goals: string; visibility: 'shared' | 'coach_only'; rows: Record<string, Row> }

export const emptyRow = (): Row => ({ rating: null, comment: '', media: null, frame: null, timeMs: null })

const draft = ref<Draft | null>(null)
/** Set while the person is choosing a frame for a criterion: where to come back to, and whose clips. */
const picking = ref<{ criterion: string; archer: number; returnTo: string } | null>(null)
const picked = ref<{ criterion: string; media: string; frame: number; timeMs: number } | null>(null)

export function useEvaluationDraft() {
  return {
    draft,
    picking,
    picked,
    clear() {
      draft.value = null
      picking.value = null
      picked.value = null
    },
    startPick(criterion: string, archer: number, returnTo: string) {
      picking.value = { criterion, archer, returnTo }
      picked.value = null
    },
    /** The frame is chosen: remember it and say where to go back to. */
    finishPick(media: string, frame: number, timeMs: number): string | null {
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
