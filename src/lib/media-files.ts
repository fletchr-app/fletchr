import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';

import type { MediaFiles } from './media-queue.ts';

// The files of queued photos and videos, in the app's own folder (not the cache, which the system may empty). The video
// plugin writes there too: files/media-queue/{id}.file. In the browser the plugin keeps them in IndexedDB.
const FOLDER = 'media-queue';
const path = (id: string, part: 'file' | 'thumb', folder = FOLDER) => `${folder}/${id}.${part}`;
// Photos and clips that went up, kept to open without a connection (media-keep.ts). Apart from the queue, so clearing the one never touches the other.
const KEPT = 'media-kept';

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

async function read(id: string, part: 'file' | 'thumb', type: string, folder = FOLDER): Promise<Blob> {
  if (Capacitor.isNativePlatform()) {
    // Through the WebView's own file route: a clip of tens of MB does not pass through a base64 string.
    const { uri } = await Filesystem.getUri({ path: path(id, part, folder), directory: Directory.Data });
    const response = await fetch(Capacitor.convertFileSrc(uri));
    if (!response.ok) throw new Error('File not found');
    return new Blob([await response.blob()], { type });
  }
  const { data } = await Filesystem.readFile({ path: path(id, part, folder), directory: Directory.Data });
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

// Thumbnails of the photos and videos the server has (media-library.ts). Not the queue's folder: these are copies and can be fetched again.
const CACHE = 'media-cache';
const cachePath = (id: string) => `${CACHE}/${id}.thumb`;

export async function saveCachedThumbnail(id: string, thumbnail: Blob): Promise<void> {
  await Filesystem.writeFile({ path: cachePath(id), data: await toBase64(thumbnail), directory: Directory.Data, recursive: true });
}

/** A link the page can show as an image, or null if the thumbnail is not on the phone. */
export async function cachedThumbnailSrc(id: string): Promise<string | null> {
  try {
    if (Capacitor.isNativePlatform()) {
      const { uri } = await Filesystem.getUri({ path: cachePath(id), directory: Directory.Data });
      const response = await fetch(Capacitor.convertFileSrc(uri));
      return response.ok ? Capacitor.convertFileSrc(uri) : null;
    }
    const { data } = await Filesystem.readFile({ path: cachePath(id), directory: Directory.Data });
    return URL.createObjectURL(typeof data === 'string' ? fromBase64(data, 'image/jpeg') : data);
  } catch {
    return null;
  }
}

export async function removeCachedThumbnails(ids: string[]): Promise<void> {
  for (const id of ids) await Filesystem.deleteFile({ path: cachePath(id), directory: Directory.Data }).catch(() => {});
}

export async function removeFiles(id: string): Promise<void> {
  for (const part of ['file', 'thumb'] as const) {
    await Filesystem.deleteFile({ path: path(id, part), directory: Directory.Data }).catch(() => {});
  }
}

/** Moves the files of an item that went up out of the queue's folder to the kept ones. Returns their size in bytes, or null if they are not there. */
export async function keepFiles(id: string): Promise<number | null> {
  try {
    await Filesystem.mkdir({ path: KEPT, directory: Directory.Data, recursive: true }).catch(() => {});
    let size = 0;
    for (const part of ['file', 'thumb'] as const) {
      await Filesystem.rename({ from: path(id, part), to: path(id, part, KEPT), directory: Directory.Data, toDirectory: Directory.Data });
      size += (await Filesystem.stat({ path: path(id, part, KEPT), directory: Directory.Data })).size;
    }
    return size;
  } catch {
    await removeFiles(id);
    return null;
  }
}

export async function loadKept(id: string, fileType: string): Promise<MediaFiles> {
  return { file: await read(id, 'file', fileType, KEPT), thumbnail: await read(id, 'thumb', 'image/jpeg', KEPT) };
}

export async function removeKept(ids: string[]): Promise<void> {
  for (const id of ids) {
    for (const part of ['file', 'thumb'] as const) {
      await Filesystem.deleteFile({ path: path(id, part, KEPT), directory: Directory.Data }).catch(() => {});
    }
  }
}
