import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';

import { t } from '@/i18n';

// Large enough for the cut-outs of a target, small enough to be picked up quickly; prepareImage shrinks it further.
const LONG_SIDE = 2560;

/** A photo from the camera or the gallery (the phone asks which), or null if the person backed out. */
export async function pickPhoto(): Promise<Blob | null> {
  try {
    const photo = await Camera.getPhoto({
      resultType: CameraResultType.Uri,
      // In the browser there is no camera sheet: the file chooser opens.
      source: Capacitor.isNativePlatform() ? CameraSource.Prompt : CameraSource.Photos,
      webUseInput: true,
      width: LONG_SIDE,
      height: LONG_SIDE,
      quality: 90,
      correctOrientation: true,
      saveToGallery: false,
      promptLabelHeader: t('media.pickHeader'),
      promptLabelPhoto: t('media.fromGallery'),
      promptLabelPicture: t('media.takePhoto'),
      promptLabelCancel: t('common.cancel'),
    });
    if (!photo.webPath) return null;
    return await (await fetch(photo.webPath)).blob();
  } catch (error) {
    if (/cancel/i.test(error instanceof Error ? error.message : String(error))) return null;
    throw error;
  }
}
