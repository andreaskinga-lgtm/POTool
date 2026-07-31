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
  removePad: (index: number) => void
  swapPads: (indexA: number, indexB: number) => void
  selectPad: (index: number | null) => void
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
      return total + samples / pad.audioBuffer.sampleRate
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

  removePad: (index) =>
    set((state) => {
      const pads = [...state.pads]
      pads[index] = null
      return { pads, selectedPadIndex: null, panelView: 'overview' }
    }),

  swapPads: (indexA, indexB) =>
    set((state) => {
      const pads = [...state.pads]
      const temp = pads[indexA]
      pads[indexA] = pads[indexB]
      pads[indexB] = temp
      return { pads }
    }),

  selectPad: (index) =>
    set(() => ({
      selectedPadIndex: index,
      panelView: index !== null ? 'editor' : 'overview'
    })),

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
      panelView: 'overview',
      playbackState: 'idle',
      currentPlayingPad: null,
      importMode: null,
      importTargetPad: null,
      projectName: 'Untitled',
      projectPath: null
    }),

  loadPads: (pads) => set({ pads })
}))
