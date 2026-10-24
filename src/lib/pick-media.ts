import { Camera, type MediaResult, MediaType, MediaTypeSelection } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';

export type PickSource = 'photo' | 'video' | 'gallery';

/** A photo comes as a picture to shrink; a video as the address of the file, which the video plugin reads. */
export type Picked = { kind: 'photo'; blob: Blob; takenAt: string | null } | { kind: 'video'; uri: string; takenAt: string | null };

// Large enough for the cut-outs of a target, small enough to be picked up quickly; prepareImage shrinks it further.
const LONG_SIDE = 2560;
const CANCELLED = ['OS-PLUG-CAMR-0006', 'OS-PLUG-CAMR-0017', 'OS-PLUG-CAMR-0020']; // take photo, record video, choose from gallery

/** Can the camera app record a video here? Not in the browser. */
export const canRecordVideo = () => Capacitor.isNativePlatform();

async function toPicked(result: MediaResult): Promise<Picked | null> {
  const takenAt = result.metadata?.creationDate ?? null;
  if (result.type === MediaType.Video) return result.uri ? { kind: 'video', uri: result.uri, takenAt } : null;
  const src = result.webPath ?? (result.uri ? Capacitor.convertFileSrc(result.uri) : null);
  if (!src) return null;
  return { kind: 'photo', blob: await (await fetch(src)).blob(), takenAt };
}

/** A photo or video from the camera or the gallery, or null if the person backed out. */
export async function pickMedia(source: PickSource): Promise<Picked | null> {
  try {
    if (source === 'video') return await toPicked(await Camera.recordVideo({ saveToGallery: false, isPersistent: false, includeMetadata: true }));
    if (source === 'photo') {
      return await toPicked(
        await Camera.takePhoto({ quality: 90, targetWidth: LONG_SIDE, targetHeight: LONG_SIDE, correctOrientation: true, saveToGallery: false, webUseInput: true, includeMetadata: true }),
      );
    }
    const { results } = await Camera.chooseFromGallery({
      mediaType: MediaTypeSelection.All,
      allowMultipleSelection: false,
      quality: 90,
      targetWidth: LONG_SIDE,
      targetHeight: LONG_SIDE,
      includeMetadata: true,
    });
    return results[0] ? await toPicked(results[0]) : null;
  } catch (error) {
    const { code, message } = error as { code?: string; message?: string };
    if ((code && CANCELLED.includes(code)) || /cancel/i.test(message ?? '')) return null;
    throw error;
  }
}
