import { PadSlice } from '../types'
import { trimBuffer } from './buffer-utils'

type ScheduledSource = { source: AudioBufferSourceNode; gain: GainNode }

let audioContext: AudioContext | null = null
let scheduledSources: ScheduledSource[] = []
let playbackTimer: number | null = null
let padHighlightTimers: number[] = []
let sequencePlaybackStart: number | null = null
let sequenceAudioDuration: number = 0

export function getSequencePlaybackInfo(): { startTime: number; duration: number } | null {
  if (sequencePlaybackStart === null) return null
  return { startTime: sequencePlaybackStart, duration: sequenceAudioDuration }
}

export function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext({ sampleRate: 44100 })
  }
  if (audioContext.state === 'suspended') {
    audioContext.resume()
  }
  return audioContext
}

export async function setOutputDevice(deviceId: string): Promise<void> {
  const ctx = getAudioContext()
  if ('setSinkId' in ctx) {
    await (ctx as AudioContext & { setSinkId: (id: string) => Promise<void> }).setSinkId(deviceId)
  }
}

export async function getOutputDevices(): Promise<MediaDeviceInfo[]> {
  const devices = await navigator.mediaDevices.enumerateDevices()
  return devices.filter((d) => d.kind === 'audiooutput')
}

export function playBuffer(
  buffer: AudioBuffer,
  inPoint: number,
  outPoint: number,
  volume = 1.0
): void {
  stopPlayback()
  const ctx = getAudioContext()
  const trimmed = trimBuffer(buffer, inPoint, outPoint)

  const gainNode = ctx.createGain()
  gainNode.gain.value = volume
  gainNode.connect(ctx.destination)

  const source = ctx.createBufferSource()
  source.buffer = trimmed
  source.connect(gainNode)
  source.start(0)

  const entry: ScheduledSource = { source, gain: gainNode }
  scheduledSources = [entry]

  source.onended = () => {
    scheduledSources = scheduledSources.filter((e) => e !== entry)
    gainNode.disconnect()
  }
}

export interface SequencePlaybackCallbacks {
  onPadStart?: (padIndex: number) => void
  onComplete?: () => void
}

export function playSequence(
  pads: (PadSlice | null)[],
  countIn: boolean,
  callbacks?: SequencePlaybackCallbacks
): void {
  stopPlayback()
  const ctx = getAudioContext()

  const loadedPads: { index: number; buffer: AudioBuffer }[] = []
  for (let i = 0; i < pads.length; i++) {
    const pad = pads[i]
    if (!pad) continue
    const trimmed = trimBuffer(pad.audioBuffer, pad.inPoint, pad.outPoint)
    loadedPads.push({ index: i, buffer: trimmed })
  }

  if (loadedPads.length === 0) return

  let startOffset = 0

  // Count-in: 4 beeps at 0.5s intervals
  if (countIn) {
    startOffset = 2.0 // 4 beeps over 2 seconds
    for (let i = 0; i < 4; i++) {
      const beep = createBeep(ctx, 1000, 0.05)
      const beepGain = ctx.createGain()
      beepGain.connect(ctx.destination)
      const source = ctx.createBufferSource()
      source.buffer = beep
      source.connect(beepGain)
      source.start(ctx.currentTime + i * 0.5)
      scheduledSources.push({ source, gain: beepGain })
    }
  }

  // Schedule pads gaplessly
  const sequenceStart = ctx.currentTime + startOffset
  let nextTime = sequenceStart
  for (const { index, buffer } of loadedPads) {
    const pad = pads[index]!
    const gainNode = ctx.createGain()
    gainNode.gain.value = pad.volume ?? 1.0
    gainNode.connect(ctx.destination)

    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.connect(gainNode)
    source.start(nextTime)
    scheduledSources.push({ source, gain: gainNode })

    // Schedule callback for pad highlighting
    const padStartDelay = (nextTime - ctx.currentTime) * 1000
    if (callbacks?.onPadStart) {
      const cb = callbacks.onPadStart
      const padIndex = index
      padHighlightTimers.push(window.setTimeout(() => cb(padIndex), padStartDelay))
    }

    nextTime += buffer.duration
  }

  // Record playback timing for cursor animation
  sequencePlaybackStart = sequenceStart
  sequenceAudioDuration = nextTime - sequenceStart

  // Schedule completion callback
  const totalDuration = (nextTime - ctx.currentTime) * 1000
  if (callbacks?.onComplete) {
    const cb = callbacks.onComplete
    playbackTimer = window.setTimeout(() => {
      cb()
      playbackTimer = null
    }, totalDuration)
  }
}

export function stopPlayback(): void {
  for (const { source, gain } of scheduledSources) {
    try {
      source.stop()
      source.disconnect()
      gain.disconnect()
    } catch {
      // Already stopped
    }
  }
  scheduledSources = []

  if (playbackTimer !== null) {
    clearTimeout(playbackTimer)
    playbackTimer = null
  }

  for (const t of padHighlightTimers) {
    clearTimeout(t)
  }
  padHighlightTimers = []

  sequencePlaybackStart = null
  sequenceAudioDuration = 0
}

function createBeep(ctx: AudioContext, frequency: number, duration: number): AudioBuffer {
  const sampleRate = ctx.sampleRate
  const length = Math.round(sampleRate * duration)
  const buffer = ctx.createBuffer(1, length, sampleRate)
  const data = buffer.getChannelData(0)

  for (let i = 0; i < length; i++) {
    const t = i / sampleRate
    // Sine wave with quick envelope
    const envelope = Math.min(1, Math.min(t / 0.005, (duration - t) / 0.005))
    data[i] = Math.sin(2 * Math.PI * frequency * t) * 0.3 * envelope
  }

  return buffer
}
