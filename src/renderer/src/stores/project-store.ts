import { create } from 'zustand'
import { PadSlice, PanelView, PlaybackState, ImportMode } from '../types'

const NUM_PADS = 16
const MAX_TIME = 40 // seconds

interface ProjectStore {
  // Project metadata
  projectName: string
  projectPath: string | null

  // Pads
  pads: (PadSlice | null)[]
  selectedPadIndex: number | null
  // All currently multi-selected pads (Cmd/Ctrl-click, Shift-click range).
  // UI-only, not persisted. When only one pad is selected this mirrors
  // [selectedPadIndex]; empty when nothing is selected.
  selectedPadIndices: number[]

  // UI state
  panelView: PanelView
  playbackState: PlaybackState
  currentPlayingPad: number | null
  importMode: ImportMode | null
  importTargetPad: number | null
  countInEnabled: boolean

  // Derived
  totalDuration: () => number
  isOverBudget: () => boolean

  // Actions
  setPad: (index: number, slice: PadSlice) => void
  updateSlicePoints: (index: number, inPoint: number, outPoint: number) => void
  updatePadVolume: (index: number, volume: number) => void
  updatePadSpeed: (index: number, speed: number) => void
  updatePadsVolume: (indices: number[], volume: number) => void
  updatePadsSpeed: (indices: number[], speed: number) => void
  removePad: (index: number) => void
  swapPads: (indexA: number, indexB: number) => void
  selectPad: (index: number | null) => void
  togglePadSelection: (index: number) => void
  selectPadRange: (fromIndex: number, toIndex: number) => void
  setPanelView: (view: PanelView) => void
  setPlaybackState: (state: PlaybackState) => void
  setCurrentPlayingPad: (index: number | null) => void
  setImportMode: (mode: ImportMode | null, targetPad?: number | null) => void
  setCountInEnabled: (enabled: boolean) => void
  lofiEnabled: boolean
  setLofiEnabled: (enabled: boolean) => void
  setProjectName: (name: string) => void
  setProjectPath: (path: string | null) => void
  clearAll: () => void
  loadPads: (pads: (PadSlice | null)[]) => void
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  projectName: 'Untitled',
  projectPath: null,

  pads: Array(NUM_PADS).fill(null),
  selectedPadIndex: null,
  selectedPadIndices: [],

  panelView: 'overview',
  playbackState: 'idle',
  currentPlayingPad: null,
  importMode: null,
  importTargetPad: null,
  countInEnabled: false,
  lofiEnabled: false,

  totalDuration: () => {
    const { pads } = get()
    return pads.reduce((total, pad) => {
      if (!pad) return total
      const samples = pad.outPoint - pad.inPoint
      const speed = pad.speed ?? 1.0
      return total + samples / pad.audioBuffer.sampleRate / speed
    }, 0)
  },

  isOverBudget: () => {
    return get().totalDuration() > MAX_TIME
  },

  setPad: (index, slice) =>
    set((state) => {
      const pads = [...state.pads]
      pads[index] = slice
      return { pads }
    }),

  updateSlicePoints: (index, inPoint, outPoint) =>
    set((state) => {
      const pads = [...state.pads]
      const pad = pads[index]
      if (!pad) return state
      pads[index] = { ...pad, inPoint, outPoint }
      return { pads }
    }),

  updatePadVolume: (index, volume) =>
    set((state) => {
      const pads = [...state.pads]
      const pad = pads[index]
      if (!pad) return state
      pads[index] = { ...pad, volume }
      return { pads }
    }),

  updatePadSpeed: (index, speed) =>
    set((state) => {
      const pads = [...state.pads]
      const pad = pads[index]
      if (!pad) return state
      pads[index] = { ...pad, speed }
      return { pads }
    }),

  updatePadsVolume: (indices, volume) =>
    set((state) => {
      const pads = [...state.pads]
      for (const index of indices) {
        const pad = pads[index]
        if (pad) pads[index] = { ...pad, volume }
      }
      return { pads }
    }),

  updatePadsSpeed: (indices, speed) =>
    set((state) => {
      const pads = [...state.pads]
      for (const index of indices) {
        const pad = pads[index]
        if (pad) pads[index] = { ...pad, speed }
      }
      return { pads }
    }),

  removePad: (index) =>
    set((state) => {
      const pads = [...state.pads]
      pads[index] = null
      return { pads, selectedPadIndex: null, selectedPadIndices: [], panelView: 'overview' }
    }),

  swapPads: (indexA, indexB) =>
    set((state) => {
      const pads = [...state.pads]
      const temp = pads[indexA]
      pads[indexA] = pads[indexB]
      pads[indexB] = temp
      return { pads }
    }),

  // Plain (unmodified) click/keyboard-trigger selection — always collapses
  // to a single pad, replacing any existing multi-selection.
  selectPad: (index) =>
    set(() => ({
      selectedPadIndex: index,
      selectedPadIndices: index !== null ? [index] : [],
      panelView: index !== null ? 'editor' : 'overview'
    })),

  // Cmd/Ctrl-click — toggles a single (loaded) pad in/out of the current
  // multi-selection without affecting playback.
  togglePadSelection: (index) =>
    set((state) => {
      if (!state.pads[index]) return state
      const selection = new Set(state.selectedPadIndices)
      if (selection.has(index)) {
        selection.delete(index)
      } else {
        selection.add(index)
      }
      const indices = Array.from(selection).sort((a, b) => a - b)
      const stillSelected = indices.includes(index)
      return {
        selectedPadIndices: indices,
        selectedPadIndex: stillSelected ? index : (indices[indices.length - 1] ?? null),
        panelView: indices.length > 0 ? 'editor' : 'overview'
      }
    }),

  // Shift-click — selects the contiguous range of loaded pads between
  // fromIndex (the fixed range anchor) and toIndex, replacing the current
  // selection. Empty pads within the range are skipped. Does not move the
  // range anchor (callers keep tracking their own anchor for future ranges).
  selectPadRange: (fromIndex, toIndex) =>
    set((state) => {
      const lo = Math.min(fromIndex, toIndex)
      const hi = Math.max(fromIndex, toIndex)
      const indices: number[] = []
      for (let i = lo; i <= hi; i++) {
        if (state.pads[i]) indices.push(i)
      }
      return {
        selectedPadIndices: indices,
        selectedPadIndex: indices.length > 0 ? toIndex : null,
        panelView: indices.length > 0 ? 'editor' : 'overview'
      }
    }),

  setPanelView: (view) => set({ panelView: view }),
  setPlaybackState: (state) => set({ playbackState: state }),
  setCurrentPlayingPad: (index) => set({ currentPlayingPad: index }),

  setImportMode: (mode, targetPad = null) =>
    set({
      importMode: mode,
      importTargetPad: targetPad,
      panelView: mode ? 'import' : 'overview'
    }),

  setCountInEnabled: (enabled) => set({ countInEnabled: enabled }),
  setLofiEnabled: (enabled) => set({ lofiEnabled: enabled }),
  setProjectName: (name) => set({ projectName: name }),
  setProjectPath: (path) => set({ projectPath: path }),

  clearAll: () =>
    set({
      pads: Array(NUM_PADS).fill(null),
      selectedPadIndex: null,
      selectedPadIndices: [],
      panelView: 'overview',
      playbackState: 'idle',
      currentPlayingPad: null,
      importMode: null,
      importTargetPad: null,
      projectName: 'Untitled',
      projectPath: null
    }),

  loadPads: (pads) =>
    set({ pads, selectedPadIndex: null, selectedPadIndices: [], panelView: 'overview' })
}))
