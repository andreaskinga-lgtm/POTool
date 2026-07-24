import Meyda from 'meyda'

export interface TransientDetectorOptions {
  sensitivity: number // 0-1, higher = more detections
  maxSlices: number // target number of slices
}

export function detectTransients(
  audioBuffer: AudioBuffer,
  options: TransientDetectorOptions
): number[] {
  const { sensitivity, maxSlices } = options
  const data = audioBuffer.getChannelData(0)
  const sampleRate = audioBuffer.sampleRate
  const hopSize = 512
  const frameCount = Math.floor(data.length / hopSize)

  // Set Meyda buffer size
  Meyda.bufferSize = hopSize

  // Compute spectral flux for each frame
  const fluxValues: number[] = []
  let prevSpectrum: Float32Array | null = null

  for (let i = 0; i < frameCount; i++) {
    const start = i * hopSize
    const frame = new Float32Array(hopSize)
    for (let j = 0; j < hopSize && start + j < data.length; j++) {
      frame[j] = data[start + j]
    }

    const features = Meyda.extract(['amplitudeSpectrum'], frame)
    const spectrum = features?.amplitudeSpectrum

    if (!spectrum) {
      fluxValues.push(0)
      prevSpectrum = null
      continue
    }

    if (prevSpectrum) {
      // Spectral flux: sum of positive differences
      let flux = 0
      for (let j = 0; j < spectrum.length; j++) {
        const diff = spectrum[j] - prevSpectrum[j]
        if (diff > 0) flux += diff
      }
      fluxValues.push(flux)
    } else {
      fluxValues.push(0)
    }

    prevSpectrum = new Float32Array(spectrum)
  }

  // Adaptive threshold: median + sensitivity * stddev
  const sorted = [...fluxValues].sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)]
  const mean = fluxValues.reduce((s, v) => s + v, 0) / fluxValues.length
  const stddev = Math.sqrt(
    fluxValues.reduce((s, v) => s + (v - mean) ** 2, 0) / fluxValues.length
  )

  // Map sensitivity (0-1) to a threshold multiplier (high sensitivity = low threshold)
  const multiplier = 1.5 - sensitivity * 1.3 // Range: 0.2 to 1.5
  const threshold = median + multiplier * stddev

  // Peak picking with minimum inter-onset interval
  const minInterOnsetSamples = Math.round(sampleRate * 0.05) // 50ms minimum
  const minInterOnsetFrames = Math.round(minInterOnsetSamples / hopSize)

  const onsets: number[] = []
  let lastOnsetFrame = -minInterOnsetFrames

  for (let i = 1; i < fluxValues.length - 1; i++) {
    if (
      fluxValues[i] > threshold &&
      fluxValues[i] > fluxValues[i - 1] &&
      fluxValues[i] >= fluxValues[i + 1] &&
      i - lastOnsetFrame >= minInterOnsetFrames
    ) {
      onsets.push(i * hopSize)
      lastOnsetFrame = i
    }
  }

  // If we have more onsets than maxSlices, keep the strongest ones
  if (onsets.length > maxSlices) {
    const onsetStrengths = onsets.map((samplePos) => {
      const frameIdx = Math.floor(samplePos / hopSize)
      return { samplePos, strength: fluxValues[frameIdx] || 0 }
    })
    onsetStrengths.sort((a, b) => b.strength - a.strength)
    const topOnsets = onsetStrengths.slice(0, maxSlices).map((o) => o.samplePos)
    topOnsets.sort((a, b) => a - b)
    return topOnsets
  }

  return onsets
}

export function onsetsToSliceRegions(
  onsets: number[],
  totalLength: number,
  audioBuffer?: AudioBuffer
): { start: number; end: number }[] {
  const regions: { start: number; end: number }[] = []

  // If we have audio data, find silence after each transient for tighter out points
  const data = audioBuffer ? audioBuffer.getChannelData(0) : null
  const sampleRate = audioBuffer ? audioBuffer.sampleRate : 44100

  for (let i = 0; i < onsets.length; i++) {
    const start = onsets[i]
    const nextOnset = i < onsets.length - 1 ? onsets[i + 1] : totalLength

    let end: number
    if (data) {
      end = findSilenceAfterOnset(data, start, nextOnset, sampleRate)
    } else {
      end = nextOnset
    }
    regions.push({ start, end })
  }

  // If first onset isn't at 0, add a region from 0 to first onset
  if (onsets.length > 0 && onsets[0] > 0) {
    const firstEnd = data
      ? findSilenceAfterOnset(data, 0, onsets[0], sampleRate)
      : onsets[0]
    regions.unshift({ start: 0, end: firstEnd })
  }

  return regions
}

/**
 * Scan from an onset forward to find where the audio drops to near-silence.
 * Uses an RMS window to detect when the level falls below a threshold.
 * Returns the sample position where silence begins, clamped to maxEnd.
 */
function findSilenceAfterOnset(
  data: Float32Array,
  start: number,
  maxEnd: number,
  sampleRate: number
): number {
  const windowSize = Math.round(sampleRate * 0.01) // 10ms RMS window
  const silenceThreshold = 0.005 // ~ -46 dB
  const minDuration = Math.round(sampleRate * 0.03) // require 30ms of silence to confirm

  // Start scanning a bit after the onset to skip the initial attack
  const scanStart = Math.min(start + Math.round(sampleRate * 0.02), maxEnd)
  let silenceStart = -1
  let consecutiveSilent = 0

  for (let pos = scanStart; pos < maxEnd - windowSize; pos += windowSize) {
    // Compute RMS for this window
    let sumSq = 0
    for (let j = 0; j < windowSize; j++) {
      const s = data[pos + j]
      sumSq += s * s
    }
    const rms = Math.sqrt(sumSq / windowSize)

    if (rms < silenceThreshold) {
      if (silenceStart === -1) silenceStart = pos
      consecutiveSilent += windowSize
      if (consecutiveSilent >= minDuration) {
        // Found sustained silence - return the point where it started
        return Math.min(silenceStart, maxEnd)
      }
    } else {
      silenceStart = -1
      consecutiveSilent = 0
    }
  }

  // No silence found - use maxEnd but trim trailing silence from the end
  let trimEnd = maxEnd
  while (trimEnd > start + windowSize) {
    let sumSq = 0
    const checkStart = Math.max(trimEnd - windowSize, start)
    for (let j = checkStart; j < trimEnd; j++) {
      const s = data[j]
      sumSq += s * s
    }
    const rms = Math.sqrt(sumSq / windowSize)
    if (rms >= silenceThreshold) break
    trimEnd -= windowSize
  }

  return Math.min(trimEnd + windowSize, maxEnd)
}
