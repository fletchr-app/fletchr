import { computed, type Ref, ref } from 'vue'

import { type Pt, panned, pinched, type View, whole, zoomedAt } from '@/lib/pinch'

// Pinch and pan for a picture: two fingers zoom and move it, and with `canPan` one finger moves it once it is magnified.
// `picture` is the element that gets the transform (origin at its top left); the pointer events of the stage around it come in
// through `down`, `move` and `up`. Reading the events does not stop the layer under the fingers from reading them as well.
// A double tap magnifies the picture around the tap (DOUBLE_TAP_SCALE), or shows it whole when it is magnified, if `canDoubleTap`.
const DOUBLE_TAP_SCALE = 3
const TAP_MS = 300 // a tap is a touch that short and that still
const TAP_PX = 10
const DOUBLE_MS = 350 // the second tap comes this soon, and this close to the first
const DOUBLE_PX = 40

export function usePinchZoom(picture: Ref<HTMLElement | null>, canPan: () => boolean, canDoubleTap: () => boolean = () => true) {
  const view = ref<View>(whole())
  const pointers = new Map<number, Pt>()
  let origin: Pt = { x: 0, y: 0 } // the top left corner of the picture on the screen, as it is at scale 1
  let size = { width: 0, height: 0 }
  let two: { start: View; ids: [number, number]; from: [Pt, Pt] } | null = null
  let one: { start: View; from: Pt } | null = null
  let tap: { at: number; x: number; y: number; id: number; still: boolean } | null = null // the touch that may become a tap
  let lastTap: { at: number; x: number; y: number } | null = null

  const zoomed = computed(() => view.value.scale > 1)
  const style = computed(() =>
    zoomed.value ? { transform: `translate(${view.value.x}px, ${view.value.y}px) scale(${view.value.scale})`, transformOrigin: '0 0' } : {},
  )

  function measure() {
    const el = picture.value
    if (!el) return false
    const r = el.getBoundingClientRect()
    origin = { x: r.left - view.value.x, y: r.top - view.value.y }
    size = { width: el.offsetWidth, height: el.offsetHeight }
    return size.width > 0
  }
  const local = (e: { clientX: number; clientY: number }): Pt => ({ x: e.clientX - origin.x, y: e.clientY - origin.y })

  function down(e: PointerEvent) {
    if (!measure()) return
    pointers.set(e.pointerId, local(e))
    tap = pointers.size === 1 ? { at: performance.now(), x: e.clientX, y: e.clientY, id: e.pointerId, still: true } : null
    if (pointers.size === 2) {
      const [a, b] = [...pointers.entries()]
      two = { start: { ...view.value }, ids: [a![0], b![0]], from: [a![1], b![1]] }
      one = null
    } else if (pointers.size === 1) one = { start: { ...view.value }, from: local(e) }
  }
  function move(e: PointerEvent) {
    if (!pointers.has(e.pointerId)) return
    pointers.set(e.pointerId, local(e))
    if (tap && tap.id === e.pointerId && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > TAP_PX) tap.still = false
    if (two) {
      const a = pointers.get(two.ids[0])
      const b = pointers.get(two.ids[1])
      if (a && b) view.value = pinched(two.start, two.from, [a, b], size)
    } else if (one && pointers.size === 1 && zoomed.value && canPan()) {
      const p = local(e)
      view.value = panned(one.start, p.x - one.from.x, p.y - one.from.y, size)
    }
  }
  function up(e: PointerEvent, cancelled = false) {
    const now = performance.now()
    if (!cancelled && tap && tap.id === e.pointerId && tap.still && now - tap.at < TAP_MS && pointers.size === 1) {
      if (lastTap && now - lastTap.at < DOUBLE_MS && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < DOUBLE_PX) {
        lastTap = null
        if (canDoubleTap()) view.value = zoomed.value ? whole() : zoomedAt(view.value, local(e), DOUBLE_TAP_SCALE, size)
      } else lastTap = { at: now, x: e.clientX, y: e.clientY }
    } else if (tap?.id === e.pointerId) lastTap = null
    tap = null
    pointers.delete(e.pointerId)
    if (two && pointers.size < 2) two = null
    if (pointers.size === 1) {
      // one finger is left: it goes on from where the picture is now
      measure()
      const [id, at] = [...pointers.entries()][0]!
      pointers.set(id, at)
      one = { start: { ...view.value }, from: at }
    } else if (pointers.size === 0) one = null
  }
  const fingers = () => pointers.size
  function reset() {
    view.value = whole()
    pointers.clear()
    two = one = null
  }
  const cancel = (e: PointerEvent) => up(e, true)
  return { view, style, zoomed, down, move, up, cancel, fingers, reset }
}
