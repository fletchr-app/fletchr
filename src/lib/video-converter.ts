import { registerPlugin } from '@capacitor/core';

import type { VideoInfo } from './video-plan.ts';

// The native plugin (android/app/src/main/java/de/fletchr/app/VideoConverterPlugin.java).
export type InspectResult = VideoInfo & { thumbnail: string | null };
export type ConvertOptions = { uri: string; id: string; height: number; bitrate: number; speed: number; keyframeSeconds: number };
export type ConvertResult = { bytes: number; durationMs: number; frames: number; convertMs: number };
/** Why a conversion did not happen: the `code` of the rejection. */
export type ConvertErrorCode = 'unreadable' | 'busy' | 'cancelled' | 'conversion_failed';

export type VideoConverterPlugin = {
  inspect(options: { uri: string }): Promise<InspectResult>;
  convert(options: ConvertOptions): Promise<ConvertResult>;
  cancel(): Promise<void>;
  addListener(event: 'progress', listener: (e: { percent: number }) => void): Promise<{ remove: () => Promise<void> }>;
};

export const VideoConverter = registerPlugin<VideoConverterPlugin>('VideoConverter');
