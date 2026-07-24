import { trimBuffer } from './buffer-utils'
import toWav from 'audiobuffer-to-wav'
import { PadSlice } from '../types'

export function buildCombinedBuffer(pads: (PadSlice | null)[]): AudioBuffer | null {
  const slices: { buffer: AudioBuffer; volume: number }[] = []

  for (const pad of pads) {
    if (!pad) continue
    const trimmed = trimBuffer(pad.audioBuffer, pad.inPoint, pad.outPoint)
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

export function exportCombinedWav(pads: (PadSlice | null)[]): ArrayBuffer | null {
  const combined = buildCombinedBuffer(pads)
  if (!combined) return null
  return encodeWav(combined)
}
