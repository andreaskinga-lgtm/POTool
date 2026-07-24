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
      onMenuEvent: (channel: string, callback: () => void) => () => void
    }
  }
}

export {}
