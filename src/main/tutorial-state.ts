import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'

export type TourId = 'general' | 'import' | 'padEditing'

export interface TutorialState {
  disabled: boolean
  seen: Record<TourId, boolean>
}

function defaultState(): TutorialState {
  return {
    disabled: false,
    seen: { general: false, import: false, padEditing: false }
  }
}

function statePath(): string {
  return join(app.getPath('userData'), 'tutorial-state.json')
}

let cached: TutorialState | null = null

function load(): TutorialState {
  if (cached) return cached
  const filePath = statePath()
  if (existsSync(filePath)) {
    try {
      const raw = JSON.parse(readFileSync(filePath, 'utf-8'))
      cached = {
        disabled: Boolean(raw.disabled),
        seen: {
          general: Boolean(raw.seen?.general),
          import: Boolean(raw.seen?.import),
          padEditing: Boolean(raw.seen?.padEditing)
        }
      }
      return cached
    } catch {
      // Fall through to defaults if the file is corrupt/unreadable
    }
  }
  cached = defaultState()
  return cached
}

function persist(state: TutorialState): void {
  cached = state
  const filePath = statePath()
  const dir = join(filePath, '..')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  writeFileSync(filePath, JSON.stringify(state, null, 2), 'utf-8')
}

export function getTutorialState(): TutorialState {
  return load()
}

export function markTutorialSeen(id: TourId): TutorialState {
  const state = load()
  const next: TutorialState = { ...state, seen: { ...state.seen, [id]: true } }
  persist(next)
  return next
}

export function setTutorialsDisabled(disabled: boolean): TutorialState {
  const state = load()
  const next: TutorialState = { ...state, disabled }
  persist(next)
  return next
}

export function resetTutorials(): TutorialState {
  const next = defaultState()
  persist(next)
  return next
}
