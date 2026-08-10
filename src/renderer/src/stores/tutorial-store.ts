import { create } from 'zustand'
import type { TourId, TutorialState } from '../types'
import { TOUR_STEPS } from '../tutorial/tour-definitions'

interface TutorialStore {
  initialized: boolean
  disabled: boolean
  seen: Record<TourId, boolean>
  activeTour: TourId | null
  stepIndex: number

  init: () => Promise<void>
  start: (id: TourId) => void
  next: () => void
  back: () => void
  dismiss: () => void
  setDisabled: (disabled: boolean) => void
  replay: () => Promise<void>
}

const defaultSeen: Record<TourId, boolean> = { general: false, import: false, padEditing: false }

export const useTutorialStore = create<TutorialStore>((set, get) => ({
  initialized: false,
  disabled: false,
  seen: defaultSeen,
  activeTour: null,
  stepIndex: 0,

  init: async () => {
    if (get().initialized) return
    const state: TutorialState = await window.api.getTutorialState()
    set({ disabled: state.disabled, seen: state.seen, initialized: true })
  },

  start: (id) => {
    const { disabled, seen, activeTour } = get()
    if (disabled || seen[id] || activeTour) return
    set({ activeTour: id, stepIndex: 0 })
  },

  next: () => {
    const { activeTour, stepIndex } = get()
    if (!activeTour) return
    const steps = TOUR_STEPS[activeTour]
    if (stepIndex >= steps.length - 1) {
      get().dismiss()
      return
    }
    set({ stepIndex: stepIndex + 1 })
  },

  back: () => {
    const { stepIndex } = get()
    set({ stepIndex: Math.max(0, stepIndex - 1) })
  },

  dismiss: () => {
    const { activeTour } = get()
    if (!activeTour) return
    set({ activeTour: null, stepIndex: 0, seen: { ...get().seen, [activeTour]: true } })
    void window.api.markTutorialSeen(activeTour)
  },

  setDisabled: (disabled) => {
    set({ disabled })
    void window.api.setTutorialsDisabled(disabled)
  },

  replay: async () => {
    const state: TutorialState = await window.api.resetTutorials()
    set({ disabled: state.disabled, seen: state.seen, activeTour: null, stepIndex: 0 })
    get().start('general')
  }
}))
