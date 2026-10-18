import { onBeforeUnmount, ref, watch, type Ref } from 'vue'

/** The width in px of an element, kept up to date as the window or its container changes (also when the element is replaced). */
export function useElementWidth(el: Ref<HTMLElement | null>) {
  const width = ref(0)
  const observer = new ResizeObserver((entries) => (width.value = entries[0]?.contentRect.width ?? width.value))
  watch(
    el,
    (next, previous) => {
      if (previous) observer.unobserve(previous)
      if (next) {
        width.value = next.clientWidth
        observer.observe(next)
      }
    },
    { flush: 'post' },
  )
  onBeforeUnmount(() => observer.disconnect())
  return width
}
