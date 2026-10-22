import { onBeforeUnmount, ref, watch, type Ref } from 'vue'

/** The size in px of an element, kept up to date as the window or its container changes (also when the element is replaced). */
export function useElementSize(el: Ref<HTMLElement | null>) {
  const size = ref({ width: 0, height: 0 })
  const observer = new ResizeObserver((entries) => {
    const rect = entries[0]?.contentRect
    if (rect) size.value = { width: rect.width, height: rect.height }
  })
  watch(
    el,
    (next, previous) => {
      if (previous) observer.unobserve(previous)
      if (next) {
        size.value = { width: next.clientWidth, height: next.clientHeight }
        observer.observe(next)
      }
    },
    { flush: 'post' },
  )
  onBeforeUnmount(() => observer.disconnect())
  return size
}
