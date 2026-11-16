import { ref } from 'vue'

import type { Landmark } from '@/lib/skeleton'

// Finds the people in one picture with MediaPipe's Pose Landmarker, on the phone, offline. The code, the wasm and the
// model are part of the app (Vite `?url` imports) and are loaded on the first use only. The landmarker is kept.
type Landmarker = { detect: (image: HTMLCanvasElement | HTMLImageElement | ImageBitmap) => { landmarks: Landmark[][] }; close: () => void }

let landmarker: Promise<{ landmarker: Landmarker; delegate: 'GPU' | 'CPU' }> | null = null
export const poseBusy = ref(false)

async function create() {
  const [{ PoseLandmarker }, loader, binary, model] = await Promise.all([
    import('@mediapipe/tasks-vision'),
    import('@mediapipe/tasks-vision/vision_wasm_internal.js?url'),
    import('@mediapipe/tasks-vision/vision_wasm_internal.wasm?url'),
    import('@/assets/models/pose_landmarker_lite.task?url'),
  ])
  const fileset = { wasmLoaderPath: loader.default, wasmBinaryPath: binary.default }
  const make = (delegate: 'GPU' | 'CPU') =>
    PoseLandmarker.createFromOptions(fileset, { baseOptions: { modelAssetPath: model.default, delegate }, runningMode: 'IMAGE', numPoses: 3 })
  try {
    return { landmarker: (await make('GPU')) as unknown as Landmarker, delegate: 'GPU' as const }
  } catch {
    return { landmarker: (await make('CPU')) as unknown as Landmarker, delegate: 'CPU' as const }
  }
}

/** The poses found in the picture (x and y as fractions of it), with how long loading and finding took and which delegate ran. */
export async function detectPoses(image: HTMLCanvasElement | HTMLImageElement | ImageBitmap) {
  poseBusy.value = true
  try {
    const t0 = performance.now()
    landmarker ??= create().catch((e) => ((landmarker = null), Promise.reject(e)))
    const { landmarker: model, delegate } = await landmarker
    const t1 = performance.now()
    const poses = model.detect(image).landmarks
    return { poses, delegate, loadMs: Math.round(t1 - t0), detectMs: Math.round(performance.now() - t1) }
  } finally {
    poseBusy.value = false
  }
}
