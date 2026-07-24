import { useCallback, useEffect, useRef, useState } from 'react'
import WaveSurfer from 'wavesurfer.js'
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.js'
import type { Region } from 'wavesurfer.js/dist/plugins/regions.js'
import { audioBufferToBlob } from '../audio/buffer-utils'

const MAX_PX_PER_SEC = 2000

export interface OnReadyResult {
  initialZoomLevel?: number
  initialScrollRatio?: number
}

export interface UseWaveformCanvasOptions {
  height?: number
  /** Changing this value forces WaveSurfer to be recreated even when audioBuffer
   * is the same object reference (e.g. multiple pads sharing one AudioBuffer). */
  resetKey?: unknown
  onReady?: (ws: WaveSurfer, regions: RegionsPlugin) => OnReadyResult | void
  onRegionUpdated?: (region: Region, regions: RegionsPlugin) => void
}

export interface UseWaveformCanvasReturn {
  wavesurferRef: React.RefObject<WaveSurfer | null>
  regionsRef: React.RefObject<RegionsPlugin | null>
  handleZoomIn: () => void
  handleZoomOut: () => void
  handleZoomReset: () => void
}

export function styleRegionHandles(region: Region): void {
  const el = region.element
  if (!el) return

  function applyHandleStyle(handle: HTMLElement, type: 'in' | 'out'): void {
    const color = type === 'in' ? '#33cc66' : '#ff3333'
    handle.style.width = '2px'
    handle.style.background = color
    handle.style.border = 'none'
    handle.style.opacity = '1'
    handle.style.position = 'absolute'
    handle.style.top = '0'
    handle.style.bottom = '0'
    handle.style.overflow = 'visible'

    const flag = document.createElement('div')
    flag.style.position = 'absolute'
    flag.style.top = '0'
    flag.style.width = '0'
    flag.style.height = '0'
    flag.style.borderTop = '8px solid ' + color
    flag.style.borderBottom = '8px solid transparent'
    if (type === 'in') {
      flag.style.left = '0'
      flag.style.borderLeft = '2px solid ' + color
      flag.style.borderRight = '8px solid transparent'
    } else {
      flag.style.right = '0'
      flag.style.borderRight = '2px solid ' + color
      flag.style.borderLeft = '8px solid transparent'
    }
    handle.appendChild(flag)
  }

  const handles = el.querySelectorAll('[data-resize]')
  if (handles.length >= 2) {
    applyHandleStyle(handles[0] as HTMLElement, 'in')
    applyHandleStyle(handles[1] as HTMLElement, 'out')
  } else {
    const children = Array.from(el.children) as HTMLElement[]
    const handleEls = children.filter(
      (c) => c.style.cursor === 'ew-resize' || c.style.position === 'absolute'
    )
    if (handleEls.length >= 2) {
      applyHandleStyle(handleEls[0], 'in')
      applyHandleStyle(handleEls[handleEls.length - 1], 'out')
    }
  }
}

export function useWaveformCanvas(
  containerRef: React.RefObject<HTMLDivElement | null>,
  audioBuffer: AudioBuffer | null,
  options: UseWaveformCanvasOptions = {}
): UseWaveformCanvasReturn {
  const { height = 128, resetKey } = options

  const wavesurferRef = useRef<WaveSurfer | null>(null)
  const regionsRef = useRef<RegionsPlugin | null>(null)
  const zoomAnchorRef = useRef<number | null>(null)
  const zoomToScrollRef = useRef<number | null>(null)

  const [zoomLevel, setZoomLevel] = useState(0)

  // Latest-ref pattern: always call the most recent version of the callbacks
  const onReadyRef = useRef(options.onReady)
  const onRegionUpdatedRef = useRef(options.onRegionUpdated)
  useEffect(() => {
    onReadyRef.current = options.onReady
    onRegionUpdatedRef.current = options.onRegionUpdated
  })

  // WaveSurfer lifecycle: create/destroy when audioBuffer changes
  useEffect(() => {
    if (!containerRef.current || !audioBuffer) return

    // Reset zoom so a subsequent setZoomLevel(X) always triggers the zoom effect,
    // even if X happens to equal the previous pad's zoom value.
    setZoomLevel(0)

    const regions = RegionsPlugin.create()
    regionsRef.current = regions

    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: '#664422',
      progressColor: '#553311',
      cursorColor: '#ffffff',
      cursorWidth: 1,
      height,
      normalize: false,
      fillParent: true,
      autoScroll: false,
      autoCenter: false,
      plugins: [regions]
    })

    // WaveSurfer renders inside a Shadow DOM — inject scrollbar styles directly
    // so the .scroll element's scrollbar matches the app theme and doesn't
    // expand/turn white on hover (external CSS cannot cross the shadow boundary).
    const shadowHost = containerRef.current.querySelector(':scope > div')
    if (shadowHost?.shadowRoot) {
      const style = document.createElement('style')
      style.textContent = `
        .scroll::-webkit-scrollbar { height: 8px; }
        .scroll::-webkit-scrollbar-track { background: transparent; }
        .scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 4px; }
        .scroll::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
      `
      shadowHost.shadowRoot.appendChild(style)
    }

    ws.loadBlob(audioBufferToBlob(audioBuffer))

    ws.on('ready', () => {
      const result = onReadyRef.current?.(ws, regions)
      if (result?.initialZoomLevel !== undefined) {
        zoomToScrollRef.current = result.initialScrollRatio ?? null
        setZoomLevel(result.initialZoomLevel)
      }
    })

    // Disable adjustScroll to prevent flickering when a region is wider than the viewport
    ;(regions as any).adjustScroll = () => {}

    regions.on('region-updated', (region) => {
      onRegionUpdatedRef.current?.(region, regions)
    })

    wavesurferRef.current = ws

    return () => {
      ws.destroy()
      wavesurferRef.current = null
      regionsRef.current = null
    }
  }, [audioBuffer, height, resetKey])

  // Apply zoom, preserving scroll position around the anchor point
  useEffect(() => {
    const ws = wavesurferRef.current
    if (!ws || !ws.getDuration()) return

    const scrollEl = ws.getWrapper().parentElement
    if (!scrollEl) return

    if (zoomToScrollRef.current !== null) {
      // Initial zoom: center the viewport on the stored ratio
      const centerRatio = zoomToScrollRef.current
      zoomToScrollRef.current = null

      ws.zoom(zoomLevel)

      const newScrollWidth = scrollEl.scrollWidth
      const clientWidth = scrollEl.clientWidth
      scrollEl.scrollLeft = centerRatio * newScrollWidth - clientWidth / 2
    } else {
      // Normal zoom: keep the cursor/center anchor stable
      const oldScrollLeft = scrollEl.scrollLeft
      const clientWidth = scrollEl.clientWidth
      const oldScrollWidth = scrollEl.scrollWidth

      let anchorRatio: number
      let anchorClientX: number

      if (zoomAnchorRef.current !== null) {
        anchorRatio = zoomAnchorRef.current
        anchorClientX = anchorRatio * oldScrollWidth - oldScrollLeft
        zoomAnchorRef.current = null
      } else {
        anchorRatio = oldScrollWidth > 0 ? (oldScrollLeft + clientWidth / 2) / oldScrollWidth : 0.5
        anchorClientX = clientWidth / 2
      }

      ws.zoom(zoomLevel)

      const newScrollWidth = scrollEl.scrollWidth
      scrollEl.scrollLeft = anchorRatio * newScrollWidth - anchorClientX
    }
  }, [zoomLevel])

  // Ctrl/Cmd+wheel zoom — re-attaches when audioBuffer changes so the listener
  // is always registered after the container div is in the DOM
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const onWheel = (e: WheelEvent): void => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        const ws = wavesurferRef.current
        if (!ws || !ws.getDuration()) return

        const containerWidth = el.clientWidth
        const basePxPerSec = containerWidth / ws.getDuration()
        const step = basePxPerSec * 2

        const scrollEl = ws.getWrapper().parentElement
        if (scrollEl) {
          const rect = scrollEl.getBoundingClientRect()
          const cursorX = e.clientX - rect.left + scrollEl.scrollLeft
          const scrollWidth = scrollEl.scrollWidth
          zoomAnchorRef.current = scrollWidth > 0 ? cursorX / scrollWidth : 0.5
        }

        setZoomLevel((prev) =>
          e.deltaY < 0 ? Math.min(prev + step, MAX_PX_PER_SEC) : Math.max(prev - step, 0)
        )
      }
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [audioBuffer])

  const handleZoomIn = useCallback(() => {
    setZoomLevel((prev) => {
      const ws = wavesurferRef.current
      if (!ws || !ws.getDuration()) return prev
      const duration = ws.getDuration()
      const containerWidth = containerRef.current?.clientWidth ?? 400
      const step = (containerWidth / duration) * 2
      return Math.min(prev + step, MAX_PX_PER_SEC)
    })
  }, [])

  const handleZoomOut = useCallback(() => {
    setZoomLevel((prev) => {
      const ws = wavesurferRef.current
      if (!ws || !ws.getDuration()) return prev
      const duration = ws.getDuration()
      const containerWidth = containerRef.current?.clientWidth ?? 400
      const step = (containerWidth / duration) * 2
      return Math.max(prev - step, 0)
    })
  }, [])

  const handleZoomReset = useCallback(() => {
    setZoomLevel(0)
  }, [])

  return {
    wavesurferRef,
    regionsRef,
    handleZoomIn,
    handleZoomOut,
    handleZoomReset,
  }
}
