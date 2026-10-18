import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

/** On a phone: write the file to the cache and open the share sheet, so it can be saved or sent. */
export async function saveJson(filename: string, text: string): Promise<'saved' | 'shared'> {
  const file = new File(Paths.cache, filename);
  if (file.exists) file.delete();
  file.create();
  await file.write(text);
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device');
  await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Your data', UTI: 'public.json' });
  return 'shared';
}
