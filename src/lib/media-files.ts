import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';

import type { MediaFiles } from './media-queue.ts';

// The files of queued photos and videos, in the app's own folder (not the cache, which the system may empty). The video
// plugin writes there too: files/media-queue/{id}.file. In the browser the plugin keeps them in IndexedDB.
const FOLDER = 'media-queue';
const path = (id: string, part: 'file' | 'thumb') => `${FOLDER}/${id}.${part}`;

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export function fromBase64(data: string, type: string): Blob {
  const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type });
}

async function write(id: string, part: 'file' | 'thumb', blob: Blob) {
  await Filesystem.writeFile({ path: path(id, part), data: await toBase64(blob), directory: Directory.Data, recursive: true });
}

async function read(id: string, part: 'file' | 'thumb', type: string): Promise<Blob> {
  if (Capacitor.isNativePlatform()) {
    // Through the WebView's own file route: a clip of tens of MB does not pass through a base64 string.
    const { uri } = await Filesystem.getUri({ path: path(id, part), directory: Directory.Data });
    const response = await fetch(Capacitor.convertFileSrc(uri));
    if (!response.ok) throw new Error('File not found');
    return new Blob([await response.blob()], { type });
  }
  const { data } = await Filesystem.readFile({ path: path(id, part), directory: Directory.Data });
  return typeof data === 'string' ? fromBase64(data, type) : data; // the browser returns a Blob
}

export async function saveFiles(id: string, files: MediaFiles): Promise<void> {
  await write(id, 'file', files.file);
  await write(id, 'thumb', files.thumbnail);
}

/** For a clip whose file the video plugin wrote already. */
export async function saveThumbnail(id: string, thumbnail: Blob): Promise<void> {
  await write(id, 'thumb', thumbnail);
}

/** `fileType` is the type of the main file (the preview is always a JPEG). */
export async function loadFiles(id: string, fileType: string): Promise<MediaFiles> {
  return { file: await read(id, 'file', fileType), thumbnail: await read(id, 'thumb', 'image/jpeg') };
}

export async function loadThumbnail(id: string): Promise<Blob> {
  return read(id, 'thumb', 'image/jpeg');
}

export async function removeFiles(id: string): Promise<void> {
  for (const part of ['file', 'thumb'] as const) {
    await Filesystem.deleteFile({ path: path(id, part), directory: Directory.Data }).catch(() => {});
  }
}
