import { t } from '@/i18n';
import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

/** In the browser: download the file. On a phone: write it to the cache and open the share sheet, so it can be saved or sent. */
export async function saveJson(filename: string, text: string): Promise<'saved' | 'shared'> {
  if (Capacitor.isNativePlatform()) {
    const { uri } = await Filesystem.writeFile({ path: filename, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 });
    if (!(await Share.canShare()).value) throw new Error('Sharing is not available on this device');
    await Share.share({ title: t('privacy.title'), files: [uri] });
    return 'shared';
  }
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return 'saved';
}
