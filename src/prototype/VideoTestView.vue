<script setup lang="ts">
import { IonButton } from '@ionic/vue'
import { ref } from 'vue'

import { Capacitor } from '@capacitor/core'

import AppPage from '@/components/AppPage.vue'
import { VideoConverter, type ConvertOptions } from './video-converter'
import { jumpTest, loadVideo, measurePlayback, memoryMb, stepTest, uploadBlob } from './video-test'

// Throwaway page for #35 (only built with VITE_PROTOTYPE=1). Choose or record a clip, then run the checks.
const video = ref<HTMLVideoElement | null>(null)
const log = ref<string[]>([])
const info = ref<Record<string, unknown>>({})
const running = ref(false)
const say = (line: string) => log.value.push(line)
let objectUrl = ''
;(window as unknown as { __video: unknown }).__video = { log, info }

async function open(url: string, label: string) {
  log.value = []
  const before = memoryMb()
  const meta = await loadVideo(video.value!, url)
  info.value = { label, ...meta, heapMbBefore: before, heapMbAfter: memoryMb() }
  say(`loaded ${label}: ${meta.width}x${meta.height}, ${meta.duration.toFixed(2)} s`)
}

async function picked(event: Event, source: string) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return say(`${source}: nothing chosen`)
  if (objectUrl) URL.revokeObjectURL(objectUrl)
  objectUrl = URL.createObjectURL(file)
  await open(objectUrl, `${source}: ${file.name} (${(file.size / 1048576).toFixed(1)} MB, ${file.type})`)
}

/** Used from the desktop (through the debugger): load a clip from a URL, with the true frame times of the file. */
async function fromUrl(url: string, truth?: number[], fraction = 0.5) {
  const blob = await (await fetch(url)).blob()
  if (objectUrl) URL.revokeObjectURL(objectUrl)
  objectUrl = URL.createObjectURL(blob)
  await open(objectUrl, `url: ${url} (${(blob.size / 1048576).toFixed(1)} MB)`)
  return run(truth, fraction)
}

async function run(truth?: number[], fraction = 0.5) {
  const v = video.value!
  running.value = true
  try {
    const playback = await measurePlayback(v, 2)
    say(`playback: ${playback.frames} frames shown in 2 s at rate ${playback.rate}, frame ${playback.medianMs.toFixed(2)} ms, ${playback.gaps} gaps`)
    const frameSec = truth ? (truth[truth.length - 1]! - truth[0]!) / (truth.length - 1) : playback.medianMs / 1000
    const frames = truth ? truth.length : Math.floor(v.duration / frameSec)
    const steps = await stepTest(v, 100, 120, frameSec, truth, fraction)
    say(`step forward 120: ${JSON.stringify(steps.forward)}`)
    say(`step back 120: ${JSON.stringify(steps.backward)}`)
    if (steps.worst.length) say(`first misses: ${JSON.stringify(steps.worst)}`)
    const jumps = await jumpTest(v, frames, frameSec, 40, truth, fraction)
    say(`40 jumps across the clip: ${JSON.stringify(jumps)}`)
    info.value = { ...info.value, playback, steps, jumps, frameSec, frames, heapMbAfterTests: memoryMb() }
  } catch (e) {
    say(`failed: ${(e as Error).message}`)
  }
  running.value = false
  return info.value
}
/** Upload the clip `copies` times in one request to `target`, in the background of the page; read `__upload` for progress. */
async function upload(source: string, target: string, copies: number) {
  const blob = await (await fetch(source)).blob()
  const big = new Blob(Array.from({ length: copies }, () => blob))
  const state = { startedAt: Date.now(), totalMb: Math.round(big.size / 1048576), sentMb: 0, done: false, result: null as unknown }
  ;(window as unknown as { __upload: unknown }).__upload = state
  void uploadBlob(target, big, (sent) => (state.sentMb = Math.round(sent / 1048576))).then((r) => {
    state.done = true
    state.result = r
  })
  return state.totalMb
}
/** Pick a clip, convert it with the native plugin, show the result and play it. */
async function convertOnPhone(options: ConvertOptions, again = false) {
  log.value = []
  say(again ? 'converting the same clip again...' : 'picking and converting...')
  try {
    const r = await (again ? VideoConverter.convertAgain(options) : VideoConverter.pickAndConvert(options))
    say(`converted in ${(r.convertMs / 1000).toFixed(1)} s: ${(r.bytes / 1048576).toFixed(2)} MB, ${r.exportVideoFrames} frames (source ${r.srcFrames})`)
    info.value = { converted: r }
    const url = Capacitor.convertFileSrc(`file://${r.path}`)
    const meta = await loadVideo(video.value!, url)
    info.value = { converted: r, loaded: meta }
    say(`playing the result: ${meta.width}x${meta.height}, ${meta.duration.toFixed(2)} s`)
  } catch (e) {
    say(`failed: ${(e as Error).message ?? e}`)
  }
  return info.value
}
;(window as unknown as { __videoTest: unknown }).__videoTest = { fromUrl, run, upload, convertOnPhone }
</script>

<template>
  <AppPage title="Video prototype (#35)">
    <div class="screen">
      <label class="d-flex flex-column gap-1">
        <span class="fw-semibold">1. Choose from gallery</span>
        <input type="file" accept="video/*" @change="picked($event, 'gallery')" />
      </label>
      <label class="d-flex flex-column gap-1">
        <span class="fw-semibold">2. Take video (camera)</span>
        <input type="file" accept="video/*" capture="environment" @change="picked($event, 'camera')" />
      </label>
      <IonButton :disabled="running" @click="convertOnPhone({})">3. Pick and convert on the phone (native)</IonButton>
      <video ref="video" playsinline muted style="width: 100%; max-height: 260px; background: #000"></video>
      <IonButton :disabled="running" @click="run()">Run checks on this clip</IonButton>
      <pre style="white-space: pre-wrap; font-size: 11px">{{ log.join('\n') }}</pre>
      <pre style="white-space: pre-wrap; font-size: 11px">{{ JSON.stringify(info, null, 1) }}</pre>
    </div>
  </AppPage>
</template>
