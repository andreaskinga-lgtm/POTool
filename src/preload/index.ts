import { contextBridge, ipcRenderer } from 'electron'

const api = {
  // File dialogs
  openAudioFile: (): Promise<string | null> => ipcRenderer.invoke('dialog:openAudioFile'),
  readFile: (filePath: string): Promise<ArrayBuffer> => ipcRenderer.invoke('fs:readFile', filePath),
  saveWav: (arrayBuffer: ArrayBuffer): Promise<boolean> =>
    ipcRenderer.invoke('dialog:saveWav', arrayBuffer),

  // Project
  readDir: (folderPath: string): Promise<string[]> => ipcRenderer.invoke('fs:readDir', folderPath),
  openProjectDialog: (): Promise<string | null> => ipcRenderer.invoke('dialog:openProject'),
  saveProjectAsDialog: (): Promise<string | null> => ipcRenderer.invoke('dialog:saveProjectAs'),
  loadProject: (folderPath: string): Promise<unknown> =>
    ipcRenderer.invoke('project:load', folderPath),
  writeProjectFile: (folderPath: string, filename: string, data: ArrayBuffer): Promise<void> =>
    ipcRenderer.invoke('project:writeFile', folderPath, filename, data),
  saveProject: (
    folderPath: string,
    projectJson: string,
    filesToCopy: { src: string; dest: string }[]
  ): Promise<boolean> => ipcRenderer.invoke('project:save', folderPath, projectJson, filesToCopy),

  // Window controls (custom title bar)
  platform: process.platform,
  windowMinimize: (): Promise<void> => ipcRenderer.invoke('window:minimize'),
  windowMaximize: (): Promise<void> => ipcRenderer.invoke('window:maximize'),
  windowClose: (): Promise<void> => ipcRenderer.invoke('window:close'),
  windowIsMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:isMaximized'),

  // Tutorial state
  getTutorialState: (): Promise<unknown> => ipcRenderer.invoke('tutorial:getState'),
  markTutorialSeen: (id: string): Promise<unknown> => ipcRenderer.invoke('tutorial:markSeen', id),
  setTutorialsDisabled: (disabled: boolean): Promise<unknown> =>
    ipcRenderer.invoke('tutorial:setDisabled', disabled),
  resetTutorials: (): Promise<unknown> => ipcRenderer.invoke('tutorial:reset'),

  // Menu events
  onMenuEvent: (channel: string, callback: () => void): (() => void) => {
    const handler = (): void => callback()
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.removeListener(channel, handler)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.api = api
}
