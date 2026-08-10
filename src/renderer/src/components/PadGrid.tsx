import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useProjectStore } from '../stores/project-store'
import { playBuffer, stopPlayback } from '../audio/audio-engine'
import { mergeAudioBuffers } from '../audio/buffer-utils'
import type { PadSlice } from '../types'

type PadDropMenu = {
  x: number
  y: number
  sourceIdx: number
  targetIdx: number
}

const PAD_KEYS: Record<string, number> = {
  '1': 0,
  '2': 1,
  '3': 2,
  '4': 3,
  q: 4,
  w: 5,
  e: 6,
  r: 7,
  a: 8,
  s: 9,
  d: 10,
  f: 11,
  z: 12,
  x: 13,
  c: 14,
  v: 15
}

const PAD_KEY_LABELS: string[] = [
  '1',
  '2',
  '3',
  '4',
  'q',
  'w',
  'e',
  'r',
  'a',
  's',
  'd',
  'f',
  'z',
  'x',
  'c',
  'v'
]

export function PadGrid(): React.JSX.Element {
  const pads = useProjectStore((s) => s.pads)
  const selectedPadIndex = useProjectStore((s) => s.selectedPadIndex)
  const currentPlayingPad = useProjectStore((s) => s.currentPlayingPad)
  const selectPad = useProjectStore((s) => s.selectPad)
  const setImportMode = useProjectStore((s) => s.setImportMode)
  const setPad = useProjectStore((s) => s.setPad)
  const removePad = useProjectStore((s) => s.removePad)
  const swapPads = useProjectStore((s) => s.swapPads)
  const lofiEnabled = useProjectStore((s) => s.lofiEnabled)

  const [dragSourceIndex, setDragSourceIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [dropMenu, setDropMenu] = useState<PadDropMenu | null>(null)

  const handlePadClick = useCallback(
    (index: number): void => {
      const pad = pads[index]
      if (pad) {
        playBuffer(
          pad.audioBuffer,
          pad.inPoint,
          pad.outPoint,
          pad.volume ?? 1.0,
          lofiEnabled,
          pad.speed ?? 1.0
        )
        selectPad(index)
      } else {
        setImportMode('single', index)
      }
    },
    [pads, selectPad, setImportMode, lofiEnabled]
  )

  const handleDragStart = (e: React.DragEvent, index: number): void => {
    stopPlayback()
    setDragSourceIndex(index)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent, index: number): void => {
    e.preventDefault()
    if (dragSourceIndex === null || dragSourceIndex === index) return
    setDragOverIndex(index)
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDragLeave = (): void => {
    setDragOverIndex(null)
  }

  const handleDrop = (e: React.DragEvent, targetIdx: number): void => {
    e.preventDefault()
    setDragOverIndex(null)
    if (dragSourceIndex === null || dragSourceIndex === targetIdx) {
      setDragSourceIndex(null)
      return
    }

    const sourceIdx = dragSourceIndex
    setDragSourceIndex(null)

    // Clamp menu to viewport (max height: 3 items ~130px, width ~140px)
    const x = Math.min(e.clientX, window.innerWidth - 148)
    const y = Math.min(e.clientY, window.innerHeight - 138)

    setDropMenu({ x, y, sourceIdx, targetIdx })
  }

  const handleDragEnd = (): void => {
    setDragSourceIndex(null)
    setDragOverIndex(null)
  }

  const closeMenu = useCallback((): void => {
    setDropMenu(null)
  }, [])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (dropMenu !== null) return
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
        return
      const index = PAD_KEYS[e.key.toLowerCase()]
      if (index !== undefined) {
        e.preventDefault()
        handlePadClick(index)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [pads, dropMenu, handlePadClick])

  return (
    <div className="pad-grid-wrapper" onClick={() => selectPad(null)}>
      <div className="pad-grid" data-tour="pad-grid">
        {pads.map((pad, index) => {
          const isSelected = selectedPadIndex === index
          const isPlaying = currentPlayingPad === index
          const isDragging = dragSourceIndex === index
          const isDragOverEmpty = dragOverIndex === index && !pad
          const isDragOverLoaded = dragOverIndex === index && !!pad

          let className = 'pad'
          if (pad) className += ' pad--loaded'
          if (isSelected) className += ' pad--selected'
          if (isPlaying) className += ' pad--playing'
          if (isDragging) className += ' pad--dragging'
          if (isDragOverEmpty) className += ' pad--drag-over-empty'
          if (isDragOverLoaded) className += ' pad--drag-over-loaded'

          return (
            <button
              key={index}
              className={className}
              draggable={!!pad}
              onClick={(e) => {
                e.stopPropagation()
                handlePadClick(index)
              }}
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, index)}
              onDragEnd={handleDragEnd}
            >
              <span className="pad__number">{index + 1}</span>
              <span className="pad__key-hint">{PAD_KEY_LABELS[index]}</span>
              {pad ? (
                <MiniWaveform
                  buffer={pad.audioBuffer}
                  inPoint={pad.inPoint}
                  outPoint={pad.outPoint}
                />
              ) : (
                <span className="pad__empty-label">+</span>
              )}
            </button>
          )
        })}

        {dropMenu &&
          createPortal(
            <DropMenu
              menu={dropMenu}
              pads={pads}
              setPad={setPad}
              removePad={removePad}
              swapPads={swapPads}
              selectPad={selectPad}
              onClose={closeMenu}
            />,
            document.body
          )}
      </div>
    </div>
  )
}

// ─── Drop Context Menu ────────────────────────────────────────────────────────

type DropMenuProps = {
  menu: PadDropMenu
  pads: (PadSlice | null)[]
  setPad: (index: number, slice: PadSlice) => void
  removePad: (index: number) => void
  swapPads: (a: number, b: number) => void
  selectPad: (index: number | null) => void
  onClose: () => void
}

type MergeState = 'idle' | 'merging' | 'error'

function DropMenu({
  menu,
  pads,
  setPad,
  removePad,
  swapPads,
  selectPad,
  onClose
}: DropMenuProps): React.JSX.Element {
  const menuRef = useRef<HTMLDivElement>(null)
  const [mergeState, setMergeState] = useState<MergeState>('idle')

  const sourcePad = pads[menu.sourceIdx]
  const targetPad = pads[menu.targetIdx]
  const targetIsEmpty = !targetPad

  useEffect(() => {
    const onMouseDown = (e: MouseEvent): void => {
      if (mergeState === 'merging') return
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && mergeState !== 'merging') onClose()
    }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose, mergeState])

  if (!sourcePad) return <></>

  const doMove = (): void => {
    setPad(menu.targetIdx, { ...sourcePad, id: menu.targetIdx + 1 })
    removePad(menu.sourceIdx)
    selectPad(menu.targetIdx)
    onClose()
  }

  const doCopy = (): void => {
    setPad(menu.targetIdx, { ...sourcePad, id: menu.targetIdx + 1 })
    selectPad(menu.targetIdx)
    onClose()
  }

  const doSwap = (): void => {
    swapPads(menu.sourceIdx, menu.targetIdx)
    selectPad(menu.targetIdx)
    onClose()
  }

  const doReplace = (): void => {
    setPad(menu.targetIdx, { ...sourcePad, id: menu.targetIdx + 1 })
    removePad(menu.sourceIdx)
    selectPad(menu.targetIdx)
    onClose()
  }

  const doMerge = async (): Promise<void> => {
    if (!targetPad) return
    setMergeState('merging')
    try {
      const merged = await mergeAudioBuffers(
        sourcePad.audioBuffer,
        sourcePad.inPoint,
        sourcePad.outPoint,
        targetPad.audioBuffer,
        targetPad.inPoint,
        targetPad.outPoint
      )
      const mergedSlice: PadSlice = {
        id: menu.targetIdx + 1,
        filePath: '',
        fileName: `${sourcePad.fileName} + ${targetPad.fileName}`,
        audioBuffer: merged,
        inPoint: 0,
        outPoint: merged.length
      }
      setPad(menu.targetIdx, mergedSlice)
      selectPad(menu.targetIdx)
      onClose()
    } catch {
      setMergeState('error')
      setTimeout(() => setMergeState('idle'), 2000)
    }
  }

  return (
    <div ref={menuRef} className="drop-menu" style={{ left: menu.x, top: menu.y }}>
      {targetIsEmpty ? (
        <>
          <button className="drop-menu__item" onClick={doMove}>
            Move
          </button>
          <button className="drop-menu__item" onClick={doCopy}>
            Copy
          </button>
        </>
      ) : (
        <>
          <button className="drop-menu__item" onClick={doSwap}>
            Swap
          </button>
          <button className="drop-menu__item" onClick={doReplace}>
            Replace
          </button>
          <button
            className={`drop-menu__item${mergeState === 'error' ? ' drop-menu__item--error' : ''}`}
            disabled={mergeState === 'merging'}
            onClick={doMerge}
          >
            {mergeState === 'idle' ? 'Merge' : mergeState === 'merging' ? 'Merging…' : 'Failed'}
          </button>
        </>
      )}
    </div>
  )
}

function MiniWaveform({
  buffer,
  inPoint,
  outPoint
}: {
  buffer: AudioBuffer
  inPoint: number
  outPoint: number
}): React.JSX.Element {
  const numBars = 20
  const data = buffer.getChannelData(0)
  const sliceLength = outPoint - inPoint
  const blockSize = Math.max(1, Math.floor(sliceLength / numBars))

  const bars: number[] = []
  for (let i = 0; i < numBars; i++) {
    let sum = 0
    const start = inPoint + i * blockSize
    for (let j = 0; j < blockSize && start + j < outPoint; j++) {
      sum += Math.abs(data[start + j])
    }
    bars.push(sum / blockSize)
  }

  const maxVal = Math.max(...bars, 0.001)

  return (
    <svg className="pad__waveform" viewBox={`0 0 ${numBars * 3} 20`} preserveAspectRatio="none">
      {bars.map((val, i) => {
        const height = (val / maxVal) * 16
        return (
          <rect
            key={i}
            x={i * 3}
            y={10 - height / 2}
            width={2}
            height={Math.max(1, height)}
            fill="currentColor"
            opacity={0.8}
          />
        )
      })}
    </svg>
  )
}
