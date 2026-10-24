import { registerPlugin } from '@capacitor/core'

export type ConvertOptions = { height?: number; keyframeFrames?: number; realTimeline?: boolean; bitrate?: number; iFrameSeconds?: number }
export type ConvertResult = {
  path: string
  bytes: number
  convertMs: number
  captureFps: number
  fileFps: number
  speed: number
  outFps: number
  srcFrames: number
  srcDurationS: number
  srcWidth: number
  srcHeight: number
  srcLocationTag: string | null
  iFrameSeconds: number
  exportVideoFrames: number
  exportDurationMs: number
}

// Prototype plugin of #70 (android/app/src/main/java/de/fletchr/app/VideoConverterPlugin.java).
export const VideoConverter = registerPlugin<{ pickAndConvert(options: ConvertOptions): Promise<ConvertResult>; convertAgain(options: ConvertOptions): Promise<ConvertResult> }>('VideoConverter')
