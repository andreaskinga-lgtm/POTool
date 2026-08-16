import { useEffect, useRef, useState } from 'react'
import { useProjectStore } from '../stores/project-store'
import { useTutorialStore } from '../stores/tutorial-store'
import { findNearestZeroCrossing } from '../audio/buffer-utils'
import { useWaveformCanvas, styleRegionHandles } from '../hooks/use-waveform-canvas'
import { ZoomControls } from './ZoomControls'

const MIN_PX_PER_SEC = 0
const MAX_PX_PER_SEC = 2000

export function WaveformEditor(): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const [verticalGain, setVerticalGain] = useState(1)
  const [volumePct, setVolumePct] = useState(100)
  const [speedPct, setSpeedPct] = useState(100)
  const [volumeInput, setVolumeInput] = useState('100')
  const [speedInput, setSpeedInput] = useState('1.00')
  const volumeInputFocused = useRef(false)
  const speedInputFocused = useRef(false)

  const selectedPadIndex = useProjectStore((s) => s.selectedPadIndex)
  const selectedPadIndices = useProjectStore((s) => s.selectedPadIndices)
  const pads = useProjectStore((s) => s.pads)
  const updateSlicePoints = useProjectStore((s) => s.updateSlicePoints)
  const updatePadVolume = useProjectStore((s) => s.updatePadVolume)
  const updatePadSpeed = useProjectStore((s) => s.updatePadSpeed)
  const updatePadsVolume = useProjectStore((s) => s.updatePadsVolume)
  const updatePadsSpeed = useProjectStore((s) => s.updatePadsSpeed)
  const removePad = useProjectStore((s) => s.removePad)

  const pad = selectedPadIndex !== null ? pads[selectedPadIndex] : null
  const isMultiSelect = selectedPadIndices.length > 1

  const { wavesurferRef, handleZoomIn, handleZoomOut, handleZoomReset } = useWaveformCanvas(
    containerRef,
    isMultiSelect ? null : (pad?.audioBuffer ?? null),
    {
      // Slightly reduced from the original 256px so the new editable
      // volume/speed inputs don't crowd out the horizontal scrollbar that
      // renders beneath the waveform within the panel's fixed height.
      height: 254,
      resetKey: `${selectedPadIndex}-${isMultiSelect}`,

      onReady(ws, regions) {
        if (!pad || isMultiSelect) return
        const sampleRate = pad.audioBuffer.sampleRate
        const inTime = pad.inPoint / sampleRate
        const outTime = pad.outPoint / sampleRate
        const duration = ws.getDuration()

        const region = regions.addRegion({
          start: inTime,
          end: outTime,
          color: 'rgba(255, 102, 0, 0.25)',
          drag: true,
          resize: true
        })
        styleRegionHandles(region)

        const containerWidth = containerRef.current?.clientWidth ?? 400
        const sliceDuration = outTime - inTime
        const visibleDuration = Math.min(sliceDuration * 1.4, duration)
        const targetPxPerSec = containerWidth / visibleDuration
        const initialZoomLevel = Math.min(Math.max(targetPxPerSec, MIN_PX_PER_SEC), MAX_PX_PER_SEC)
        const initialScrollRatio = (inTime + outTime) / 2 / duration

        return { initialZoomLevel, initialScrollRatio }
      },

      onRegionUpdated(region) {
        if (selectedPadIndex === null || !pad || isMultiSelect) return
        const sampleRate = pad.audioBuffer.sampleRate
        const data = pad.audioBuffer.getChannelData(0)

        let inSample = Math.round(region.start * sampleRate)
        let outSample = Math.round(region.end * sampleRate)

        inSample = findNearestZeroCrossing(data, inSample)
        outSample = findNearestZeroCrossing(data, outSample)

        inSample = Math.max(0, inSample)
        outSample = Math.min(data.length, outSample)

        updateSlicePoints(selectedPadIndex, inSample, outSample)
      }
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

  // Sync volume slider/input to the selected (anchor) pad's stored volume
  useEffect(() => {
    const p = selectedPadIndex !== null ? pads[selectedPadIndex] : null
    const pct = Math.round((p?.volume ?? 1.0) * 100)
    setVolumePct(pct)
    if (!volumeInputFocused.current) setVolumeInput(String(pct))
  }, [selectedPadIndex, pads])

  // Sync speed slider/input to the selected (anchor) pad's stored speed
  useEffect(() => {
    const p = selectedPadIndex !== null ? pads[selectedPadIndex] : null
    const pct = Math.round((p?.speed ?? 1.0) * 100)
    setSpeedPct(pct)
    if (!speedInputFocused.current) setSpeedInput((pct / 100).toFixed(2))
  }, [selectedPadIndex, pads])

  // Trigger the pad-editing tutorial tour once a pad is actually selected/rendered here
  useEffect(() => {
    if (selectedPadIndex === null || !pad) return
    useTutorialStore.getState().start('padEditing')
  }, [selectedPadIndex, pad])

  if (!pad || selectedPadIndex === null) return <div />

  const applyVolume = (pct: number): void => {
    if (isMultiSelect) {
      updatePadsVolume(selectedPadIndices, pct / 100)
    } else if (selectedPadIndex !== null) {
      updatePadVolume(selectedPadIndex, pct / 100)
    }
  }

  const applySpeed = (pct: number): void => {
    if (isMultiSelect) {
      updatePadsSpeed(selectedPadIndices, pct / 100)
    } else if (selectedPadIndex !== null) {
      updatePadSpeed(selectedPadIndex, pct / 100)
    }
  }

  const commitVolumeInput = (): void => {
    const parsed = Number(volumeInput.trim())
    if (volumeInput.trim() === '' || !Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
      // Out of bounds / invalid — silently revert to the value before editing
      setVolumeInput(String(volumePct))
      return
    }
    const rounded = Math.round(parsed)
    setVolumePct(rounded)
    setVolumeInput(String(rounded))
    applyVolume(rounded)
  }

  const commitSpeedInput = (): void => {
    const parsed = Number(speedInput.trim())
    if (speedInput.trim() === '' || !Number.isFinite(parsed) || parsed < 0.01 || parsed > 4.0) {
      // Out of bounds / invalid — silently revert to the value before editing
      setSpeedInput((speedPct / 100).toFixed(2))
      return
    }
    let pct = Math.round(parsed * 100)
    // Soft snap to 100 (1x), matching the slider's behavior
    if (Math.abs(pct - 100) <= 2) pct = 100
    setSpeedPct(pct)
    setSpeedInput((pct / 100).toFixed(2))
    applySpeed(pct)
  }

  const sliceDuration = (pad.outPoint - pad.inPoint) / pad.audioBuffer.sampleRate

  return (
    <div className="waveform-editor">
      {isMultiSelect ? (
        <div className="waveform-editor__multi-message">
          {selectedPadIndices.length} Pads Selected
        </div>
      ) : (
        <>
          <div className="waveform-editor__controls">
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                color: 'var(--color-text-dim)'
              }}
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
                color: 'var(--color-text-dim)'
              }}
              title="Vertical gain — amplifies waveform display to reveal quiet transients"
              data-tour="editor-gain"
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
            <span
              data-tour="editor-zoom"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              <ZoomControls
                onZoomIn={handleZoomIn}
                onZoomOut={handleZoomOut}
                onZoomReset={handleZoomReset}
              />
            </span>
            <button
              className="btn-delete"
              onClick={() => removePad(selectedPadIndex)}
              data-tour="editor-delete"
            >
              Delete
            </button>
          </div>
          <div
            className="waveform-editor__wavesurfer"
            ref={containerRef}
            data-tour="editor-wavesurfer"
          />
        </>
      )}
      <div className="waveform-editor__controls-row">
        <div className="waveform-editor__volume" data-tour="editor-volume">
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 11,
              color: 'var(--color-text-dim)'
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
                setVolumeInput(String(val))
                applyVolume(val)
              }}
              onDoubleClick={() => {
                setVolumePct(100)
                setVolumeInput('100')
                applyVolume(100)
              }}
              style={{ width: 120 }}
            />
            <input
              type="text"
              inputMode="numeric"
              className="waveform-editor__value-input"
              value={volumeInput}
              onChange={(e) => setVolumeInput(e.target.value)}
              onFocus={() => {
                volumeInputFocused.current = true
              }}
              onBlur={() => {
                volumeInputFocused.current = false
                commitVolumeInput()
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur()
                if (e.key === 'Escape') {
                  setVolumeInput(String(volumePct))
                  e.currentTarget.blur()
                }
              }}
            />
            <span style={{ fontFamily: 'var(--font-mono)' }}>%</span>
          </label>
        </div>
        <div className="waveform-editor__speed" data-tour="editor-speed">
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 11,
              color: 'var(--color-text-dim)'
            }}
          >
            Speed
            <input
              type="range"
              min={1}
              max={400}
              step={1}
              value={speedPct}
              onChange={(e) => {
                let val = parseInt(e.target.value, 10)
                // Soft snap to 100 (1x) when within ±2
                if (Math.abs(val - 100) <= 2) val = 100
                setSpeedPct(val)
                setSpeedInput((val / 100).toFixed(2))
                applySpeed(val)
              }}
              onDoubleClick={() => {
                setSpeedPct(100)
                setSpeedInput('1.00')
                applySpeed(100)
              }}
              style={{ width: 120 }}
            />
            <input
              type="text"
              inputMode="decimal"
              className="waveform-editor__value-input waveform-editor__value-input--speed"
              value={speedInput}
              onChange={(e) => setSpeedInput(e.target.value)}
              onFocus={() => {
                speedInputFocused.current = true
              }}
              onBlur={() => {
                speedInputFocused.current = false
                commitSpeedInput()
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur()
                if (e.key === 'Escape') {
                  setSpeedInput((speedPct / 100).toFixed(2))
                  e.currentTarget.blur()
                }
              }}
            />
            <span style={{ fontFamily: 'var(--font-mono)' }}>x</span>
          </label>
        </div>
      </div>
    </div>
  )
}
