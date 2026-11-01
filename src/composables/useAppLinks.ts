import { App as CapacitorApp } from '@capacitor/app';
import { toastController } from '@ionic/vue';
import { onBeforeUnmount, ref } from 'vue';
import { useRouter } from 'vue-router';

import { useAuth } from '@/composables/useAuth';
import { parseAppLink } from '@/lib/app-link';
import { t } from '@/i18n';

/** The code from a password reset link, until the reset screen has taken it. A module-level value: the screen stays alive in
 * Ionic's stack and must not read the route, and the link can arrive while it is not on top. */
export const pendingResetCode = ref<string | null>(null);

/** Links that open the app: an invite goes to the screen that takes the code (signed in you join, otherwise you register), a
 * reset link to the reset screen. While the app runs the link arrives as an event; when the link started the app, it has to be asked for. */
export function useAppLinks() {
  const router = useRouter();
  const { status } = useAuth();
  // The same link can arrive twice at once (as an event and as the launch address); tapped again later it counts again.
  let lastLink = '';
  let lastAt = 0;

  function open(url: string | undefined) {
    const link = url ? parseAppLink(url) : null;
    if (!link || (url === lastLink && Date.now() - lastAt < 2000)) return;
    lastLink = url!;
    lastAt = Date.now();
    void router.isReady().then(() => {
      if (link.kind === 'join') {
        void router.push({ path: status.value === 'signedIn' ? '/join-team' : '/register', query: { code: link.code } });
      } else if (status.value === 'signedIn') {
        void toastController.create({ message: t('auth.reset.signedIn'), duration: 5000, position: 'top' }).then((toast) => toast.present());
      } else {
        pendingResetCode.value = link.code;
        void router.push('/reset-password');
      }
    });
  }

  const listener = CapacitorApp.addListener('appUrlOpen', ({ url }) => open(url));
  void CapacitorApp.getLaunchUrl().then((launch) => open(launch?.url));
  onBeforeUnmount(() => void listener.then((l) => l.remove()));
}
