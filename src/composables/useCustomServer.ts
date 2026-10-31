import { useAuth } from '@/composables/useAuth';
import { checkServer, DEFAULT_SERVER_URL, rememberCustomServer } from '@/composables/useServer';
import { t } from '@/i18n';
import { normaliseUrl, parseServerAddress } from '@/lib/server-address';

/** What the custom server screens do before they talk to the server: read the address, see that it answers, make it the server. */
export function useCustomServer() {
  const { switchServer } = useAuth();

  async function use(input: string): Promise<{ url: string } | { error: string }> {
    const parsed = parseServerAddress(input, { allowHttp: import.meta.env.DEV });
    if ('error' in parsed) return { error: t(`serverAddress.${parsed.error}`) };
    if (parsed.url === normaliseUrl(DEFAULT_SERVER_URL)) return { error: t('serverAddress.isDefault') };
    if ((await checkServer(parsed.url)) !== 'ok') return { error: t('serverAddress.unreachable') };
    await switchServer(parsed.url);
    rememberCustomServer(parsed.url);
    return { url: parsed.url };
  }

  return { use };
}
