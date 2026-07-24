import { useEffect, useRef, useState } from 'react'
import { useProjectStore } from '../stores/project-store'
import { decodeAudioFile, findNearestZeroCrossing, parseOp1Slices } from '../audio/buffer-utils'
import { detectTransients, onsetsToSliceRegions } from '../audio/transient-detector'
import { PadSlice } from '../types'
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.js'
import { useWaveformCanvas, styleRegionHandles } from '../hooks/use-waveform-canvas'
import { ZoomControls } from './ZoomControls'

export function ImportView(): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)

  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null)
  const [filePath, setFilePath] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string>('')
  const [sensitivity, setSensitivity] = useState(0.5)
  const [maxSlices, setMaxSlices] = useState(16)
  const [sliceRegions, setSliceRegions] = useState<{ start: number; end: number }[]>([])
  const [verticalGain, setVerticalGain] = useState(1)
  const [op1Slices, setOp1Slices] = useState<{ start: number; end: number }[] | null>(null)

  const importMode = useProjectStore((s) => s.importMode)
  const importTargetPad = useProjectStore((s) => s.importTargetPad)
  const pads = useProjectStore((s) => s.pads)
  const setPad = useProjectStore((s) => s.setPad)
  const setImportMode = useProjectStore((s) => s.setImportMode)
  const selectPad = useProjectStore((s) => s.selectPad)

  // Load file on mount (ref prevents StrictMode double-invoke)
  const didOpenRef = useRef(false)
  useEffect(() => {
    if (didOpenRef.current) return
    didOpenRef.current = true
    loadFile()
  }, [])

  async function loadFile(): Promise<void> {
    const path = await window.api.openAudioFile()
    if (!path) {
      setImportMode(null)
      return
    }

    setFilePath(path)
    setFileName(path.split('/').pop() || path.split('\\').pop() || 'audio')

    const arrayBuffer = await window.api.readFile(path)
    setOp1Slices(parseOp1Slices(arrayBuffer))
    const buffer = await decodeAudioFile(arrayBuffer)
    setAudioBuffer(buffer)
  }

  const { wavesurferRef, regionsRef, handleZoomIn, handleZoomOut, handleZoomReset } =
    useWaveformCanvas(containerRef, audioBuffer, {
      height: 256,

      onReady(ws, regions) {
        if (importMode === 'single' && audioBuffer) {
          const duration = ws.getDuration()
          const region = regions.addRegion({
            start: 0,
            end: duration,
            color: 'rgba(255, 102, 0, 0.25)',
            drag: true,
            resize: true
          })
          styleRegionHandles(region)
          setSliceRegions([{ start: 0, end: audioBuffer.length }])
        }
      },

      onRegionUpdated(_region, regions) {
        if (!audioBuffer) return
        syncRegionsToState(regions, audioBuffer)
      }
    })

  // Apply vertical gain by re-rendering the waveform at the correct amplitude
  useEffect(() => {
    const ws = wavesurferRef.current
    if (!ws) return
    ws.setOptions({ barHeight: verticalGain })
  }, [verticalGain])

  function syncRegionsToState(regions: RegionsPlugin, buffer: AudioBuffer): void {
    const allRegions = regions.getRegions()
    const sorted = allRegions.sort((a, b) => a.start - b.start)
    const sampleRate = buffer.sampleRate
    setSliceRegions(
      sorted.map((r) => ({
        start: Math.round(r.start * sampleRate),
        end: Math.round(r.end * sampleRate)
      }))
    )
  }

  // ─── Slice preview playback ───────────────────────────────────────────────
  const audioCtxRef = useRef<AudioContext | null>(null)
  const playingSourceRef = useRef<AudioBufferSourceNode | null>(null)

  function playSlice(start: number, end: number): void {
    if (!audioBuffer) return
    // Stop any in-progress playback
    try { playingSourceRef.current?.stop() } catch { /* already stopped */ }
    playingSourceRef.current = null

    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new AudioContext()
    }
    const ctx = audioCtxRef.current
    const source = ctx.createBufferSource()
    source.buffer = audioBuffer
    source.connect(ctx.destination)
    source.start(0, start, end - start)
    source.onended = () => { playingSourceRef.current = null }
    playingSourceRef.current = source
  }

  // ─── Draw-slice state ──────────────────────────────────────────────────────
  const [pendingInTime, setPendingInTime] = useState<number | null>(null)
  const [mouseX, setMouseX] = useState<number | null>(null)
  // Geometry snapshot captured from the DOM — updated without touching refs in render
  const [overlayGeo, setOverlayGeo] = useState<{
    scrollLeft: number
    totalWidth: number
    duration: number
    offsetX: number
  } | null>(null)

  // Ref so the native dblclick listener can read current pendingInTime without stale closures
  const pendingInTimeRef = useRef<number | null>(null)
  useEffect(() => {
    pendingInTimeRef.current = pendingInTime
  }, [pendingInTime])

  /** Convert a viewport clientX to a time (seconds) — safe to call in event handlers. */
  // All slice-drawing events are handled with native listeners on the shadow host so
  // that WaveSurfer's shadow DOM does not intercept them before we can act on them.
  useEffect(() => {
    const el = containerRef.current
    if (!el || !audioBuffer) return

    /** Inline time-from-click helper — avoids stale closure issues. */
    function timeFromEvent(e: MouseEvent): number {
      const ws = wavesurferRef.current
      if (!ws) return 0
      const scrollEl = ws.getWrapper()?.parentElement
      if (!scrollEl) return 0
      const duration = ws.getDuration()
      const totalWidth = scrollEl.scrollWidth
      if (!duration || !totalWidth) return 0
      const rect = scrollEl.getBoundingClientRect()
      const xInScroll = e.clientX - rect.left + scrollEl.scrollLeft
      return Math.max(0, Math.min(duration, (xInScroll / totalWidth) * duration))
    }

    const onDblClick = (e: MouseEvent): void => {
      if (pendingInTimeRef.current !== null) return
      const ws = wavesurferRef.current
      if (!ws) return
      const scrollEl = ws.getWrapper()?.parentElement
      if (!scrollEl) return
      const duration = ws.getDuration()
      const totalWidth = scrollEl.scrollWidth
      if (!duration || !totalWidth) return
      e.preventDefault()
      const scrollRect = scrollEl.getBoundingClientRect()
      const xInScroll = e.clientX - scrollRect.left + scrollEl.scrollLeft
      const time = Math.max(0, Math.min(duration, (xInScroll / totalWidth) * duration))
      const offsetX = scrollRect.left - el.getBoundingClientRect().left
      setPendingInTime(time)
      setMouseX(e.clientX - el.getBoundingClientRect().left)
      setOverlayGeo({ scrollLeft: scrollEl.scrollLeft, totalWidth, duration, offsetX })
    }

    const onClick = (e: MouseEvent): void => {
      if (e.detail > 1) return // ignore second hit of a double-click

      if (pendingInTimeRef.current === null) {
        // Not drawing a slice — check if the click landed on an existing region
        const regions = regionsRef.current
        if (regions) {
          const path = e.composedPath()
          for (const region of regions.getRegions()) {
            if (region.element && path.includes(region.element)) {
              e.stopPropagation()
              e.preventDefault()
              playSlice(region.start, region.end)
              return
            }
          }
        }
        return
      }

      e.stopPropagation() // prevent WaveSurfer seeking while pending
      e.preventDefault()
      const outTime = timeFromEvent(e)
      const inTime = pendingInTimeRef.current
      if (outTime <= inTime) {
        setPendingInTime(null)
        setMouseX(null)
        return
      }
      const regions = regionsRef.current
      if (regions) {
        const colors = ['rgba(255, 102, 0, 0.2)', 'rgba(255, 150, 50, 0.2)']
        const count = regions.getRegions().length
        const r = regions.addRegion({
          start: inTime,
          end: outTime,
          color: colors[count % 2],
          drag: true,
          resize: true
        })
        styleRegionHandles(r)
        syncRegionsToState(regions, audioBuffer)
      }
      setPendingInTime(null)
      setMouseX(null)
    }

    const onContextMenu = (e: MouseEvent): void => {
      e.preventDefault()
      e.stopPropagation()
      // Pending mode: cancel the in-progress slice
      if (pendingInTimeRef.current !== null) {
        setPendingInTime(null)
        setMouseX(null)
        return
      }
      // Not pending: right-click on an existing region deletes it
      const regions = regionsRef.current
      if (!regions) return
      // Use composedPath() so we see elements inside WaveSurfer's shadow DOM
      const path = e.composedPath()
      for (const region of regions.getRegions()) {
        if (region.element && path.includes(region.element)) {
          region.remove()
          syncRegionsToState(regions, audioBuffer)
          return
        }
      }
    }

    const onMouseMove = (e: MouseEvent): void => {
      if (pendingInTimeRef.current === null) return
      setMouseX(e.clientX - el.getBoundingClientRect().left)
    }

    const onMouseLeave = (): void => {
      if (pendingInTimeRef.current !== null) setMouseX(null)
    }

    el.addEventListener('dblclick', onDblClick)
    el.addEventListener('click', onClick, { capture: true })
    el.addEventListener('contextmenu', onContextMenu, { capture: true })
    el.addEventListener('mousemove', onMouseMove)
    el.addEventListener('mouseleave', onMouseLeave)
    return () => {
      el.removeEventListener('dblclick', onDblClick)
      el.removeEventListener('click', onClick, { capture: true })
      el.removeEventListener('contextmenu', onContextMenu, { capture: true })
      el.removeEventListener('mousemove', onMouseMove)
      el.removeEventListener('mouseleave', onMouseLeave)
    }
    // wavesurferRef, regionsRef, pendingInTimeRef are stable refs — safe to omit
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioBuffer])

  // Subscribe to scroll events while pending so the in-point line tracks scrolling
  useEffect(() => {
    if (pendingInTime === null) return
    const ws = wavesurferRef.current
    if (!ws) return
    const scrollEl = ws.getWrapper()?.parentElement
    const containerEl = containerRef.current
    if (!scrollEl || !containerEl) return

    function captureGeo(): void {
      if (!scrollEl || !containerEl || !ws) return
      setOverlayGeo({
        scrollLeft: scrollEl.scrollLeft,
        totalWidth: scrollEl.scrollWidth,
        duration: ws.getDuration(),
        offsetX: scrollEl.getBoundingClientRect().left - containerEl.getBoundingClientRect().left
      })
    }

    scrollEl.addEventListener('scroll', captureGeo)
    return () => scrollEl.removeEventListener('scroll', captureGeo)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingInTime])

  function handleOp1Slices(): void {
    if (!audioBuffer || !regionsRef.current || !op1Slices) return
    setPendingInTime(null)
    regionsRef.current.clearRegions()

    // OP-1 drum kit positions are normalised to a fixed 12-second buffer
    // (529,200 samples at 44100 Hz), regardless of the actual file length.
    const OP1_BUFFER_DURATION = 12.0
    const audioDuration = audioBuffer.duration
    const colors = ['rgba(255, 102, 0, 0.2)', 'rgba(255, 150, 50, 0.2)']
    let regionCount = 0

    op1Slices.forEach((slice) => {
      const startSec = slice.start * OP1_BUFFER_DURATION
      const endSec = Math.min(slice.end * OP1_BUFFER_DURATION, audioDuration)

      if (startSec >= audioDuration || endSec <= startSec) return

      const r = regionsRef.current!.addRegion({
        start: startSec,
        end: endSec,
        color: colors[regionCount % 2],
        drag: true,
        resize: true
      })
      styleRegionHandles(r)
      regionCount++
    })

    syncRegionsToState(regionsRef.current, audioBuffer)
  }

  function handleAutoSlice(): void {
    if (!audioBuffer || !regionsRef.current) return
    setPendingInTime(null)

    // Clear existing regions
    regionsRef.current.clearRegions()

    const onsets = detectTransients(audioBuffer, { sensitivity, maxSlices })
    const regions = onsetsToSliceRegions(onsets, audioBuffer.length, audioBuffer)
    const sampleRate = audioBuffer.sampleRate

    // Limit to maxSlices
    const limitedRegions = regions.slice(0, maxSlices)

    const colors = ['rgba(255, 102, 0, 0.2)', 'rgba(255, 150, 50, 0.2)']

    limitedRegions.forEach((region, i) => {
      const r = regionsRef.current!.addRegion({
        start: region.start / sampleRate,
        end: region.end / sampleRate,
        color: colors[i % 2],
        drag: true,
        resize: true
      })
      styleRegionHandles(r)
    })

    setSliceRegions(limitedRegions)
  }

  function handleConfirmImport(): void {
    if (!audioBuffer || !filePath || sliceRegions.length === 0) return

    if (importMode === 'single' && importTargetPad !== null) {
      // Single pad mode
      const region = sliceRegions[0]
      const data = audioBuffer.getChannelData(0)
      const inPoint = findNearestZeroCrossing(data, region.start)
      const outPoint = findNearestZeroCrossing(data, region.end)

      const slice: PadSlice = {
        id: importTargetPad + 1,
        filePath,
        fileName,
        audioBuffer,
        inPoint,
        outPoint
      }
      setPad(importTargetPad, slice)
      setImportMode(null)
      selectPad(importTargetPad)
    } else {
      // Multi-slice mode: determine starting pad
      const hasLoadedPads = pads.some((p) => p !== null)
      let startPad = 0

      if (hasLoadedPads) {
        // For now, find first empty pad; in future could prompt
        const firstEmpty = pads.findIndex((p) => p === null)
        startPad = firstEmpty >= 0 ? firstEmpty : 0
      }

      const data = audioBuffer.getChannelData(0)

      sliceRegions.forEach((region, i) => {
        const padIndex = startPad + i
        if (padIndex >= 16) return

        const inPoint = findNearestZeroCrossing(data, region.start)
        const outPoint = findNearestZeroCrossing(data, Math.min(region.end, data.length - 1))

        const slice: PadSlice = {
          id: padIndex + 1,
          filePath,
          fileName: `${fileName} [${i + 1}]`,
          audioBuffer,
          inPoint,
          outPoint
        }
        setPad(padIndex, slice)
      })

      setImportMode(null)
    }
  }

  function handleCancel(): void {
    setImportMode(null)
  }

  // Derived overlay positions — computed from state only (no ref access during render)
  const inX =
    pendingInTime !== null &&
    overlayGeo !== null &&
    overlayGeo.duration > 0 &&
    overlayGeo.totalWidth > 0
      ? overlayGeo.offsetX +
        (pendingInTime / overlayGeo.duration) * overlayGeo.totalWidth -
        overlayGeo.scrollLeft
      : null
  const isValid = inX !== null && mouseX !== null && mouseX > inX

  if (!audioBuffer) {
    return (
      <div className="import-view" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <span
          style={{ color: 'var(--color-text-dim)', fontFamily: 'var(--font-mono)', fontSize: 12 }}
        >
          Loading audio...
        </span>
      </div>
    )
  }

  return (
    <div className="import-view">
      <div className="import-view__toolbar">
        {importMode === 'multi' && (
          <>
            {op1Slices && (
              <button
                className="btn-sm"
                onClick={handleOp1Slices}
                title={`${op1Slices.length} slices embedded in file`}
              >
                OP-1 Slices
              </button>
            )}
            <button className="btn-sm" onClick={handleAutoSlice}>
              Auto-Slice
            </button>
            <div className="import-view__slider">
              <span>Sensitivity</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={sensitivity}
                onChange={(e) => setSensitivity(parseFloat(e.target.value))}
              />
            </div>
            <div className="import-view__slider">
              <span>Slices</span>
              <input
                type="number"
                min="1"
                max="16"
                value={maxSlices}
                onChange={(e) =>
                  setMaxSlices(Math.min(16, Math.max(1, parseInt(e.target.value) || 1)))
                }
              />
            </div>
          </>
        )}
        <div style={{ flex: 1 }} />
        {importMode === 'multi' && (
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              color: 'var(--color-text-dim)',
              opacity: 0.7
            }}
          >
            {pendingInTime !== null
              ? 'click to set out · right-click to cancel'
              : 'dbl-click to add slice'}
          </span>
        )}
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 11,
            color: 'var(--color-text-dim)'
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
        <span
          style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-text-dim)' }}
        >
          {sliceRegions.length} slice{sliceRegions.length !== 1 ? 's' : ''}
        </span>
        <button className="btn-sm" onClick={handleCancel}>
          Cancel
        </button>
        <button
          className="btn-sm btn-sm--primary"
          onClick={handleConfirmImport}
          disabled={sliceRegions.length === 0}
        >
          Import
        </button>
      </div>
      <div
        style={{ position: 'relative', cursor: pendingInTime !== null ? 'crosshair' : 'default' }}
      >
        <div className="import-view__wavesurfer" ref={containerRef} />
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            pointerEvents: 'none',
            overflow: 'hidden'
          }}
        >
          {inX !== null && (
            <>
              {/* In-point line */}
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                  left: inX,
                  width: 2,
                  background: '#33cc66',
                  pointerEvents: 'none'
                }}
              />
              {mouseX !== null && (
                <>
                  {/* Preview region fill */}
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      bottom: 0,
                      left: Math.min(inX, mouseX),
                      width: Math.abs(mouseX - inX),
                      background: isValid ? 'rgba(255, 102, 0, 0.25)' : 'rgba(255, 50, 50, 0.2)',
                      borderLeft: isValid
                        ? '2px solid rgba(255, 102, 0, 0.8)'
                        : '2px solid rgba(255, 50, 50, 0.6)',
                      borderRight: isValid
                        ? '2px solid rgba(255, 102, 0, 0.8)'
                        : '2px solid rgba(255, 50, 50, 0.6)',
                      pointerEvents: 'none'
                    }}
                  />
                  {/* Out-point cursor line */}
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      bottom: 0,
                      left: mouseX,
                      width: 2,
                      background: isValid ? '#ff6600' : '#ff3333',
                      pointerEvents: 'none'
                    }}
                  />
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
