import { trimBuffer, applyLofi } from './buffer-utils'
import toWav from 'audiobuffer-to-wav'
import { PadSlice } from '../types'

async function applySpeed(buffer: AudioBuffer, speed: number): Promise<AudioBuffer> {
  if (speed === 1.0) return buffer
  // Render the buffer through an OfflineAudioContext with playbackRate set.
  // At speed > 1 the output is shorter (pitched up); at speed < 1 it's longer.
  const outputLength = Math.ceil(buffer.length / speed)
  const offlineCtx = new OfflineAudioContext(1, outputLength, buffer.sampleRate)
  const source = offlineCtx.createBufferSource()
  source.buffer = buffer
  source.playbackRate.value = speed
  source.connect(offlineCtx.destination)
  source.start(0)
  return offlineCtx.startRendering()
}

export async function buildCombinedBuffer(
  pads: (PadSlice | null)[],
  lofi = false
): Promise<AudioBuffer | null> {
  const slices: { buffer: AudioBuffer; volume: number }[] = []

  for (const pad of pads) {
    if (!pad) continue
    let trimmed = trimBuffer(pad.audioBuffer, pad.inPoint, pad.outPoint)
    if (lofi) {
      trimmed = await applyLofi(trimmed)
    }
    trimmed = await applySpeed(trimmed, pad.speed ?? 1.0)
    slices.push({ buffer: trimmed, volume: pad.volume ?? 1.0 })
  }

  if (slices.length === 0) return null

  const sampleRate = slices[0].buffer.sampleRate
  const totalLength = slices.reduce((sum, s) => sum + s.buffer.length, 0)

  const offlineCtx = new OfflineAudioContext(1, totalLength, sampleRate)
  const combined = offlineCtx.createBuffer(1, totalLength, sampleRate)
  const destData = combined.getChannelData(0)

  let offset = 0
  for (const { buffer, volume } of slices) {
    const srcData = buffer.getChannelData(0)
    for (let i = 0; i < srcData.length; i++) {
      destData[offset + i] = srcData[i] * volume
    }
    offset += buffer.length
  }

  return combined
}

export function encodeWav(buffer: AudioBuffer): ArrayBuffer {
  return toWav(buffer)
}

export async function exportCombinedWav(
  pads: (PadSlice | null)[],
  lofi = false
): Promise<ArrayBuffer | null> {
  const combined = await buildCombinedBuffer(pads, lofi)
  if (!combined) return null
  return encodeWav(combined)
}
