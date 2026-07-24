import { useEffect, useRef, useState } from 'react'
import { useProjectStore } from '../stores/project-store'
import { findNearestZeroCrossing } from '../audio/buffer-utils'
import { useWaveformCanvas, styleRegionHandles } from '../hooks/use-waveform-canvas'
import { ZoomControls } from './ZoomControls'

const MIN_PX_PER_SEC = 0
const MAX_PX_PER_SEC = 2000

export function WaveformEditor(): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const [verticalGain, setVerticalGain] = useState(1)
  const [volumePct, setVolumePct] = useState(100)

  const selectedPadIndex = useProjectStore((s) => s.selectedPadIndex)
  const pads = useProjectStore((s) => s.pads)
  const updateSlicePoints = useProjectStore((s) => s.updateSlicePoints)
  const updatePadVolume = useProjectStore((s) => s.updatePadVolume)
  const removePad = useProjectStore((s) => s.removePad)

  const pad = selectedPadIndex !== null ? pads[selectedPadIndex] : null

  const { wavesurferRef, handleZoomIn, handleZoomOut, handleZoomReset } = useWaveformCanvas(
    containerRef,
    pad?.audioBuffer ?? null,
    {
      height: 256,
      resetKey: selectedPadIndex,

      onReady(ws, regions) {
        if (!pad) return
        const sampleRate = pad.audioBuffer.sampleRate
        const inTime = pad.inPoint / sampleRate
        const outTime = pad.outPoint / sampleRate
        const duration = ws.getDuration()

        const region = regions.addRegion({
          start: inTime,
          end: outTime,
          color: 'rgba(255, 102, 0, 0.25)',
          drag: true,
          resize: true,
        })
        styleRegionHandles(region)

        const containerWidth = containerRef.current?.clientWidth ?? 400
        const sliceDuration = outTime - inTime
        const visibleDuration = Math.min(sliceDuration * 1.4, duration)
        const targetPxPerSec = containerWidth / visibleDuration
        const initialZoomLevel = Math.min(
          Math.max(targetPxPerSec, MIN_PX_PER_SEC),
          MAX_PX_PER_SEC
        )
        const initialScrollRatio = (inTime + outTime) / 2 / duration

        return { initialZoomLevel, initialScrollRatio }
      },

      onRegionUpdated(region) {
        if (selectedPadIndex === null || !pad) return
        const sampleRate = pad.audioBuffer.sampleRate
        const data = pad.audioBuffer.getChannelData(0)

        let inSample = Math.round(region.start * sampleRate)
        let outSample = Math.round(region.end * sampleRate)

        inSample = findNearestZeroCrossing(data, inSample)
        outSample = findNearestZeroCrossing(data, outSample)

        inSample = Math.max(0, inSample)
        outSample = Math.min(data.length, outSample)

        updateSlicePoints(selectedPadIndex, inSample, outSample)
      },
    }
  )

  // Apply vertical gain by re-rendering the waveform at the correct amplitude
  useEffect(() => {
    const ws = wavesurferRef.current
    if (!ws) return
    ws.setOptions({ barHeight: verticalGain })
  }, [verticalGain])

  // Reset vertical gain when the selected pad changes (zoom is reset by the hook)
  useEffect(() => {
    setVerticalGain(1)
  }, [selectedPadIndex])

  // Sync volume slider to the selected pad's stored volume
  useEffect(() => {
    const p = selectedPadIndex !== null ? pads[selectedPadIndex] : null
    setVolumePct(Math.round((p?.volume ?? 1.0) * 100))
  }, [selectedPadIndex])

  if (!pad || selectedPadIndex === null) return <div />

  const sliceDuration = (pad.outPoint - pad.inPoint) / pad.audioBuffer.sampleRate

  return (
    <div className="waveform-editor">
      <div className="waveform-editor__controls">
        <span
          style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-text-dim)' }}
        >
          Pad {selectedPadIndex + 1} — {pad.fileName} — {sliceDuration.toFixed(2)}s
        </span>
        <div style={{ flex: 1 }} />
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 11,
            color: 'var(--color-text-dim)',
          }}
          title="Vertical gain — amplifies waveform display to reveal quiet transients"
        >
          Gain
          <input
            type="range"
            min={1}
            max={20}
            step={0.5}
            value={verticalGain}
            onChange={(e) => setVerticalGain(parseFloat(e.target.value))}
            style={{ width: 60 }}
          />
          <span style={{ fontFamily: 'var(--font-mono)', minWidth: 28 }}>
            {verticalGain.toFixed(1)}x
          </span>
        </label>
        <ZoomControls
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onZoomReset={handleZoomReset}
        />
        <button className="btn-delete" onClick={() => removePad(selectedPadIndex)}>
          Delete
        </button>
      </div>
      <div className="waveform-editor__wavesurfer" ref={containerRef} />
      <div className="waveform-editor__volume">
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 11,
            color: 'var(--color-text-dim)',
          }}
        >
          Volume
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={volumePct}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10)
              setVolumePct(val)
              if (selectedPadIndex !== null) {
                updatePadVolume(selectedPadIndex, val / 100)
              }
            }}
            style={{ width: 120 }}
          />
          <span style={{ fontFamily: 'var(--font-mono)', minWidth: 36 }}>
            {volumePct}%
          </span>
        </label>
      </div>
    </div>
  )
}

