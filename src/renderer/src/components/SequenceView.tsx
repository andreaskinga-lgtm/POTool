import { useEffect, useRef } from 'react'
import WaveSurfer from 'wavesurfer.js'
import { useProjectStore } from '../stores/project-store'
import { buildCombinedBuffer } from '../audio/wav-export'
import { getAudioContext, getSequencePlaybackInfo } from '../audio/audio-engine'

export function SequenceView(): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const wavesurferRef = useRef<WaveSurfer | null>(null)
  const rafRef = useRef<number | null>(null)
  const pads = useProjectStore((s) => s.pads)
  const projectName = useProjectStore((s) => s.projectName)
  const playbackState = useProjectStore((s) => s.playbackState)

  const loadedCount = pads.filter((p) => p !== null).length

  useEffect(() => {
    if (!containerRef.current) return

    const combined = buildCombinedBuffer(pads)
    const buffer = combined ?? getAudioContext().createBuffer(1, 44100, 44100)

    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: '#ff6600',
      progressColor: '#cc5200',
      cursorColor: '#ffffff',
      cursorWidth: 2,
      height: 256,
      normalize: false,
      fillParent: true,
      autoScroll: false,
      autoCenter: false,
      interact: false
    })

    ws.loadBlob(audioBufferToBlob(buffer))
    wavesurferRef.current = ws

    return () => {
      ws.destroy()
      wavesurferRef.current = null
    }
  }, [pads])

  // Animate playhead cursor during sequence playback
  useEffect(() => {
    if (playbackState !== 'playing') {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      const ws = wavesurferRef.current
      if (ws && ws.getDuration()) {
        ws.seekTo(0)
      }
      return
    }

    const tick = (): void => {
      const ws = wavesurferRef.current
      if (!ws || !ws.getDuration()) {
        rafRef.current = requestAnimationFrame(tick)
        return
      }
      const info = getSequencePlaybackInfo()
      if (!info) {
        rafRef.current = requestAnimationFrame(tick)
        return
      }
      const ctx = getAudioContext()
      const elapsed = ctx.currentTime - info.startTime
      if (elapsed >= 0 && info.duration > 0) {
        const progress = Math.min(elapsed / info.duration, 1)
        ws.seekTo(progress)
      }
      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [playbackState])

  return (
    <div className="waveform-editor">
      <div className="waveform-editor__controls">
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--color-text)' }}>
          {projectName}
        </span>
      </div>
      <div className="waveform-editor__wavesurfer" ref={containerRef} />
      <div className="sequence-view__pads-info">{loadedCount} / 16 pads loaded</div>
    </div>
  )
}

function audioBufferToBlob(buffer: AudioBuffer): Blob {
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
