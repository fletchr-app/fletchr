// Photos are shrunk and re-encoded on the phone before they go up (specs/design/media-and-video-player.md): the server stores what it gets.
// Drawing them again also drops everything the camera wrote into the file, the position of the shot among it.

export const PHOTO_MAX_SIDE = 2048;
export const THUMBNAIL_MAX_SIDE = 320;
export const AVATAR_SIDE = 256;
const AVATAR_QUALITY = 0.85;
const PHOTO_QUALITY = 0.85;
const THUMBNAIL_QUALITY = 0.75;

export type PreparedImage = { file: Blob; thumbnail: Blob; width: number; height: number };

/** The size that fits in a square of `max`, in the same proportions. A smaller picture is not enlarged. */
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

type Crop = { x: number; y: number; side: number };

async function render(source: ImageBitmap, width: number, height: number, quality: number, crop?: Crop): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('No canvas');
  context.fillStyle = '#fff'; // JPEG has no transparency
  context.fillRect(0, 0, width, height);
  if (crop) context.drawImage(source, crop.x, crop.y, crop.side, crop.side, 0, 0, width, height);
  else context.drawImage(source, 0, 0, width, height);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode the picture'))), 'image/jpeg', quality));
}

/** The largest square in the middle of a picture. */
export function centreSquare(width: number, height: number): Crop {
  const side = Math.min(width, height);
  return { x: Math.floor((width - side) / 2), y: Math.floor((height - side) / 2), side };
}

/** The profile picture: the middle square of the photo, at most AVATAR_SIDE px, as a JPEG without anything the camera wrote into the file. */
export async function prepareAvatar(source: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(source, { imageOrientation: 'from-image' });
  try {
    const crop = centreSquare(bitmap.width, bitmap.height);
    const side = Math.min(crop.side, AVATAR_SIDE);
    return await render(bitmap, side, side, AVATAR_QUALITY, crop);
  } finally {
    bitmap.close();
  }
}

/** A JPEG that is at most PHOTO_MAX_SIDE on its long side, and a small one for lists. */
export async function prepareImage(source: Blob): Promise<PreparedImage> {
  const bitmap = await createImageBitmap(source, { imageOrientation: 'from-image' });
  try {
    const photo = fitWithin(bitmap.width, bitmap.height, PHOTO_MAX_SIDE);
    const small = fitWithin(bitmap.width, bitmap.height, THUMBNAIL_MAX_SIDE);
    const [file, thumbnail] = [await render(bitmap, photo.width, photo.height, PHOTO_QUALITY), await render(bitmap, small.width, small.height, THUMBNAIL_QUALITY)];
    return { file, thumbnail, width: photo.width, height: photo.height };
  } finally {
    bitmap.close();
  }
}
