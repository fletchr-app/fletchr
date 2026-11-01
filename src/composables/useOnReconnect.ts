import { App } from '@capacitor/app';
import { Network } from '@capacitor/network';
import { onScopeDispose } from 'vue';

/** The first try can meet a connection that is still switching (mobile data to Wi-Fi), so it is repeated a few times. */
const FOLLOW_UPS_MS = [6_000, 15_000, 30_000];

/** Calls `run` when the app comes back to the front and when the connection returns, and again a little later. Stops with the scope it was created in. */
export function useOnReconnect(run: () => void) {
  let timers: ReturnType<typeof setTimeout>[] = [];
  const trigger = () => {
    timers.forEach(clearTimeout);
    run();
    timers = FOLLOW_UPS_MS.map((ms) => setTimeout(run, ms));
  };
  const handles = [
    App.addListener('appStateChange', ({ isActive }) => isActive && trigger()),
    Network.addListener('networkStatusChange', ({ connected }) => connected && trigger()),
  ];
  onScopeDispose(() => {
    timers.forEach(clearTimeout);
    handles.forEach((h) => void h.then((l) => l.remove()));
  });
}
