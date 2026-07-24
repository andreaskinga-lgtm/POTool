const TARGET_SAMPLE_RATE = 44100

let audioContext: AudioContext | null = null

function getOfflineContext(channels: number, length: number, sampleRate: number): OfflineAudioContext {
  return new OfflineAudioContext(channels, length, sampleRate)
}

export async function decodeAudioFile(arrayBuffer: ArrayBuffer): Promise<AudioBuffer> {
  if (!audioContext) {
    audioContext = new AudioContext()
  }

  let decoded: AudioBuffer
  try {
    decoded = await audioContext.decodeAudioData(arrayBuffer.slice(0))
  } catch {
    // Fallback: try manual AIFF-C parser (handles sowt/twos compression from TE devices)
    decoded = parseAifcManually(arrayBuffer)
  }

  const mono = convertToMono(decoded)
  if (mono.sampleRate !== TARGET_SAMPLE_RATE) {
    return resample(mono, TARGET_SAMPLE_RATE)
  }
  return mono
}

function parseAifcManually(arrayBuffer: ArrayBuffer): AudioBuffer {
  const view = new DataView(arrayBuffer)

  // Verify FORM header
  const formId = readFourCC(view, 0)
  if (formId !== 'FORM') throw new Error('Not an AIFF/AIFF-C file')

  const formType = readFourCC(view, 8)
  if (formType !== 'AIFC' && formType !== 'AIFF') {
    throw new Error(`Unsupported form type: ${formType}`)
  }

  // Parse chunks
  let numChannels = 1
  let numSampleFrames = 0
  let bitDepth = 16
  let sampleRate = 44100
  let compressionType = 'NONE'
  let ssndOffset = -1

  let offset = 12
  while (offset < arrayBuffer.byteLength - 8) {
    const chunkId = readFourCC(view, offset)
    const chunkSize = view.getUint32(offset + 4, false) // big-endian
    const chunkDataOffset = offset + 8

    if (chunkId === 'COMM') {
      numChannels = view.getInt16(chunkDataOffset, false)
      numSampleFrames = view.getUint32(chunkDataOffset + 2, false)
      bitDepth = view.getInt16(chunkDataOffset + 6, false)
      sampleRate = parseIeee80(view, chunkDataOffset + 8)

      if (formType === 'AIFC' && chunkSize > 18) {
        compressionType = readFourCC(view, chunkDataOffset + 18)
      }
    } else if (chunkId === 'SSND') {
      const ssndDataOffset = view.getUint32(chunkDataOffset, false)
      ssndOffset = chunkDataOffset + 8 + ssndDataOffset
    }

    // Chunks are padded to even size
    offset += 8 + chunkSize + (chunkSize % 2)
  }

  if (ssndOffset < 0) throw new Error('No SSND chunk found in AIFF file')

  const isLittleEndian = compressionType === 'sowt'
  const bytesPerSample = bitDepth / 8

  // Create AudioBuffer
  const audioBuffer = new OfflineAudioContext(numChannels, numSampleFrames, sampleRate)
    .createBuffer(numChannels, numSampleFrames, sampleRate)

  // Read PCM samples
  for (let ch = 0; ch < numChannels; ch++) {
    const channelData = audioBuffer.getChannelData(ch)
    for (let i = 0; i < numSampleFrames; i++) {
      const sampleOffset = ssndOffset + (i * numChannels + ch) * bytesPerSample
      let sample: number

      if (bitDepth === 16) {
        sample = view.getInt16(sampleOffset, isLittleEndian) / 32768
      } else if (bitDepth === 24) {
        const b0 = view.getUint8(sampleOffset)
        const b1 = view.getUint8(sampleOffset + 1)
        const b2 = view.getUint8(sampleOffset + 2)
        let val: number
        if (isLittleEndian) {
          val = (b2 << 16) | (b1 << 8) | b0
        } else {
          val = (b0 << 16) | (b1 << 8) | b2
        }
        if (val >= 0x800000) val -= 0x1000000
        sample = val / 8388608
      } else if (bitDepth === 32) {
        sample = view.getInt32(sampleOffset, isLittleEndian) / 2147483648
      } else {
        throw new Error(`Unsupported bit depth: ${bitDepth}`)
      }

      channelData[i] = sample
    }
  }

  return audioBuffer
}

function readFourCC(view: DataView, offset: number): string {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3)
  )
}

function parseIeee80(view: DataView, offset: number): number {
  // Parse 80-bit IEEE 754 extended precision float (used for AIFF sample rate)
  const exponent = view.getUint16(offset, false)
  const mantHi = view.getUint32(offset + 2, false)
  const mantLo = view.getUint32(offset + 6, false)

  const sign = (exponent & 0x8000) ? -1 : 1
  const exp = (exponent & 0x7fff) - 16383

  const mantissa = mantHi * Math.pow(2, -31) + mantLo * Math.pow(2, -63)
  return sign * mantissa * Math.pow(2, exp)
}

export function convertToMono(buffer: AudioBuffer): AudioBuffer {
  if (buffer.numberOfChannels === 1) return buffer

  const length = buffer.length
  const ctx = getOfflineContext(1, length, buffer.sampleRate)
  const monoData = new Float32Array(length)

  for (let i = 0; i < buffer.numberOfChannels; i++) {
    const channelData = buffer.getChannelData(i)
    for (let j = 0; j < length; j++) {
      monoData[j] += channelData[j] / buffer.numberOfChannels
    }
  }

  const monoBuffer = ctx.createBuffer(1, length, buffer.sampleRate)
  monoBuffer.copyToChannel(monoData, 0)
  return monoBuffer
}

export async function resample(buffer: AudioBuffer, targetRate: number): Promise<AudioBuffer> {
  const duration = buffer.duration
  const targetLength = Math.round(duration * targetRate)
  const offlineCtx = getOfflineContext(1, targetLength, targetRate)

  const source = offlineCtx.createBufferSource()
  source.buffer = buffer
  source.connect(offlineCtx.destination)
  source.start(0)

  return offlineCtx.startRendering()
}

export function findNearestZeroCrossing(data: Float32Array, sampleIndex: number, searchRange = 256): number {
  const start = Math.max(0, sampleIndex - searchRange)
  const end = Math.min(data.length - 1, sampleIndex + searchRange)

  let nearestIndex = sampleIndex
  let nearestDistance = searchRange + 1

  for (let i = start; i < end; i++) {
    // Zero crossing: sign change between adjacent samples
    if ((data[i] >= 0 && data[i + 1] < 0) || (data[i] < 0 && data[i + 1] >= 0)) {
      const distance = Math.abs(i - sampleIndex)
      if (distance < nearestDistance) {
        nearestDistance = distance
        nearestIndex = i
      }
    }
  }

  return nearestIndex
}

/**
 * Reads the OP-1/OP-Z APPL metadata chunk from an AIFF/AIFF-C file and returns
 * the embedded drum-kit slice positions as normalised values in [0, 1], or null
 * if no OP-1 data is found.
 *
 * Positions are intentionally kept normalised (not converted to seconds) so that
 * the caller can multiply by WaveSurfer's own getDuration() value. This avoids
 * progressive drift caused by WaveSurfer re-decoding the audio at the system
 * sample rate (e.g. 48 kHz), which produces a slightly different total duration
 * than the COMM-chunk value used by a COMM-based seconds conversion.
 *
 * Empty pads (where start >= end) are skipped.
 */
export function parseOp1Slices(arrayBuffer: ArrayBuffer): { start: number; end: number }[] | null {
  if (arrayBuffer.byteLength < 12) return null
  const view = new DataView(arrayBuffer)
  if (readFourCC(view, 0) !== 'FORM') return null
  const formType = readFourCC(view, 8)
  if (formType !== 'AIFF' && formType !== 'AIFC') return null

  let hasComm = false
  let op1Json: string | null = null

  let offset = 12
  while (offset + 8 <= arrayBuffer.byteLength) {
    const chunkId = readFourCC(view, offset)
    const chunkSize = view.getUint32(offset + 4, false)
    const chunkDataOffset = offset + 8
    if (chunkDataOffset + chunkSize > arrayBuffer.byteLength) break

    if (chunkId === 'COMM') {
      hasComm = true
    } else if (chunkId === 'APPL') {
      if (chunkSize >= 4 && readFourCC(view, chunkDataOffset) === 'op-1') {
        const jsonBytes = new Uint8Array(arrayBuffer, chunkDataOffset + 4, chunkSize - 4)
        op1Json = new TextDecoder().decode(jsonBytes).replace(/\0+$/, '').trim()
      }
    }

    offset += 8 + chunkSize + (chunkSize % 2)
  }

  if (!op1Json || !hasComm) return null

  let meta: Record<string, unknown>
  try {
    meta = JSON.parse(op1Json)
  } catch {
    return null
  }

  const starts = meta.start as number[] | undefined
  const ends = meta.end as number[] | undefined
  if (!Array.isArray(starts) || !Array.isArray(ends)) return null

  const OP1_MAX = 0x7fffffff
  const slices: { start: number; end: number }[] = []
  // Maps raw start integer → index in slices[], so we can deduplicate entries
  // that share the same start position but have different end values (the OP-1
  // sometimes assigns multiple pads to the same start sample with differing
  // lengths). We keep whichever has the larger end value.
  const seenStart = new Map<number, number>()

  for (let i = 0; i < Math.min(starts.length, ends.length, 24); i++) {
    // Skip exact consecutive duplicates (OP-1 fills unused slots by copying
    // the last used pad's values verbatim).
    if (i > 0 && starts[i] === starts[i - 1] && ends[i] === ends[i - 1]) continue

    const startNorm = starts[i] / OP1_MAX
    const endNorm = ends[i] / OP1_MAX
    if (endNorm > startNorm && startNorm >= 0) {
      const existingIdx = seenStart.get(starts[i])
      if (existingIdx !== undefined) {
        // Same start, different end — keep the longer one
        if (endNorm > slices[existingIdx].end) {
          slices[existingIdx] = { start: startNorm, end: endNorm }
        }
      } else {
        seenStart.set(starts[i], slices.length)
        slices.push({ start: startNorm, end: endNorm })
      }
    }
  }

  return slices.length > 0 ? slices : null
}

export function trimBuffer(buffer: AudioBuffer, inPoint: number, outPoint: number): AudioBuffer {
  const length = outPoint - inPoint
  if (length <= 0) {
    throw new Error('Invalid trim points: outPoint must be greater than inPoint')
  }

  const ctx = getOfflineContext(1, length, buffer.sampleRate)
  const trimmed = ctx.createBuffer(1, length, buffer.sampleRate)
  const sourceData = buffer.getChannelData(0)
  const destData = trimmed.getChannelData(0)

  for (let i = 0; i < length; i++) {
    destData[i] = sourceData[inPoint + i]
  }

  return trimmed
}

export function getWaveformData(buffer: AudioBuffer, numPoints: number): number[] {
  const data = buffer.getChannelData(0)
  const blockSize = Math.floor(data.length / numPoints)
  const result: number[] = []

  for (let i = 0; i < numPoints; i++) {
    let sum = 0
    const start = i * blockSize
    for (let j = 0; j < blockSize; j++) {
      sum += Math.abs(data[start + j])
    }
    result.push(sum / blockSize)
  }

  return result
}

export async function mergeAudioBuffers(
  bufA: AudioBuffer,
  inA: number,
  outA: number,
  bufB: AudioBuffer,
  inB: number,
  outB: number
): Promise<AudioBuffer> {
  const sliceA = trimBuffer(bufA, inA, outA)
  const sliceB = trimBuffer(bufB, inB, outB)
  const mergedLength = Math.max(sliceA.length, sliceB.length)

  const offlineCtx = new OfflineAudioContext(1, mergedLength, TARGET_SAMPLE_RATE)

  const srcA = offlineCtx.createBufferSource()
  srcA.buffer = sliceA
  srcA.connect(offlineCtx.destination)
  srcA.start(0)

  const srcB = offlineCtx.createBufferSource()
  srcB.buffer = sliceB
  srcB.connect(offlineCtx.destination)
  srcB.start(0)

  return offlineCtx.startRendering()
}

export function audioBufferToBlob(buffer: AudioBuffer): Blob {
  const numChannels = 1
  const sampleRate = buffer.sampleRate
  const data = buffer.getChannelData(0)
  const length = data.length
  const byteLength = length * 2 + 44

  const arrayBuffer = new ArrayBuffer(byteLength)
  const view = new DataView(arrayBuffer)

  writeString(view, 0, 'RIFF')
  view.setUint32(4, byteLength - 8, true)
  writeString(view, 8, 'WAVE')
  writeString(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * numChannels * 2, true)
  view.setUint16(32, numChannels * 2, true)
  view.setUint16(34, 16, true)
  writeString(view, 36, 'data')
  view.setUint32(40, length * 2, true)

  let offset = 44
  for (let i = 0; i < length; i++) {
    const s = Math.max(-1, Math.min(1, data[i]))
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
    offset += 2
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' })
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i))
  }
}
