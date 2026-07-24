export interface PadSlice {
  id: number // 1-16
  filePath: string // original file path
  fileName: string // display name
  audioBuffer: AudioBuffer
  inPoint: number // in point in samples
  outPoint: number // out point in samples
  volume?: number // playback gain 0.0–1.0, default 1.0
}

export interface ProjectData {
  name: string
  pads: (SerializedPadSlice | null)[]
  createdAt: string
  modifiedAt: string
}

export interface SerializedPadSlice {
  id: number
  fileName: string
  inPoint: number
  outPoint: number
  localFile: string
  volume?: number // playback gain 0.0–1.0, default 1.0
}

export type PanelView = 'overview' | 'editor' | 'import' | 'sequence'

export type PlaybackState = 'idle' | 'playing'

export type ImportMode = 'single' | 'multi'
