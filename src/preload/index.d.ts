export type TourId = 'general' | 'import' | 'padEditing'

export interface TutorialState {
  disabled: boolean
  seen: Record<TourId, boolean>
}

declare global {
  interface Window {
    api: {
      openAudioFile: () => Promise<string | null>
      readFile: (filePath: string) => Promise<ArrayBuffer>
      saveWav: (arrayBuffer: ArrayBuffer) => Promise<boolean>
      openProjectDialog: () => Promise<string | null>
      saveProjectAsDialog: () => Promise<string | null>
      readDir: (folderPath: string) => Promise<string[]>
      loadProject: (folderPath: string) => Promise<unknown>
      writeProjectFile: (folderPath: string, filename: string, data: ArrayBuffer) => Promise<void>
      saveProject: (
        folderPath: string,
        projectJson: string,
        filesToCopy: { src: string; dest: string }[]
      ) => Promise<boolean>
      platform: 'win32' | 'darwin' | 'linux'
      windowMinimize: () => Promise<void>
      windowMaximize: () => Promise<void>
      windowClose: () => Promise<void>
      windowIsMaximized: () => Promise<boolean>
      getTutorialState: () => Promise<TutorialState>
      markTutorialSeen: (id: TourId) => Promise<TutorialState>
      setTutorialsDisabled: (disabled: boolean) => Promise<TutorialState>
      resetTutorials: () => Promise<TutorialState>
      onMenuEvent: (channel: string, callback: () => void) => () => void
    }
  }
}

export {}
