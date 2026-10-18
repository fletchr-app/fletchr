import { onUnmounted, ref, toValue, watchEffect, type MaybeRefOrGetter } from 'vue';

const override = ref<string | null>(null);
export const titleOverride = override;

/** Sets the title in the header for as long as the calling screen is shown, e.g. a team's name once it is loaded. */
export function usePageTitle(title: MaybeRefOrGetter<string | null | undefined>) {
  watchEffect(() => (override.value = toValue(title) ?? null));
  onUnmounted(() => (override.value = null));
}
