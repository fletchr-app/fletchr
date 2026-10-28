import { onMounted, ref } from 'vue';

import { useAuth } from '@/composables/useAuth';
import { googleIdToken } from '@/lib/social-login';

/** What the server takes as the proof that it is the owner at the phone: the password, or for an account made with Google a fresh Google token. */
export type Proof = { password: string } | { id_token: string };

/** For the screens that ask for the password before they export or delete (privacy). An account made with Google has none. */
export function useProof() {
  const { api } = useAuth();
  const hasPassword = ref(true);

  onMounted(async () => {
    try {
      const { data } = await api.GET('/api/me/');
      if (data) hasPassword.value = data.has_password;
    } catch {
      // Offline: the password field stays, the request fails anyway.
    }
  });

  /** The proof to send, or null when the person cancelled the Google chooser. */
  async function proof(password: string): Promise<Proof | null> {
    if (hasPassword.value) return { password };
    const id_token = await googleIdToken();
    return id_token ? { id_token } : null;
  }

  return { hasPassword, proof };
}
