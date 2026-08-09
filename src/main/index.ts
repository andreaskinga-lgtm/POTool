import { app, shell, BrowserWindow, ipcMain, dialog, Menu } from 'electron'
import { join } from 'path'
import { readFile, writeFile, mkdir, copyFile, readdir } from 'fs/promises'
import { existsSync } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'
import icon from '../../resources/icon.png?asset'

const BASE_WIDTH = 600
const BASE_HEIGHT = 920
const MIN_WIDTH = 500
const MIN_HEIGHT = Math.round(MIN_WIDTH * BASE_HEIGHT / BASE_WIDTH)

function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: BASE_WIDTH,
    height: BASE_HEIGHT,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    show: false,
    autoHideMenuBar: false,
    backgroundColor: '#1a1a1a',
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  // Lock aspect ratio and scale content to always fill window proportionally
  mainWindow.setAspectRatio(BASE_WIDTH / BASE_HEIGHT)

  const updateZoom = (): void => {
    const [contentW] = mainWindow.getContentSize()
    mainWindow.webContents.setZoomFactor(contentW / BASE_WIDTH)
  }
  mainWindow.on('resize', updateZoom)
  mainWindow.webContents.on('did-finish-load', updateZoom)

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

function buildMenu(): void {
  const sendToFocused = (channel: string): void => {
    const win = BrowserWindow.getFocusedWindow()
    if (win) win.webContents.send(channel)
  }

  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        { label: 'New Project', accelerator: 'CmdOrCtrl+N', click: () => sendToFocused('menu:new-project') },
        { label: 'Open Project…', accelerator: 'CmdOrCtrl+O', click: () => sendToFocused('menu:open-project') },
        { type: 'separator' },
        { label: 'Save Project', accelerator: 'CmdOrCtrl+S', click: () => sendToFocused('menu:save-project') },
        { label: 'Save Project As…', accelerator: 'CmdOrCtrl+Shift+S', click: () => sendToFocused('menu:save-project-as') },
        { type: 'separator' },
        { label: 'Export WAV…', accelerator: 'CmdOrCtrl+E', click: () => sendToFocused('menu:export') },
        { type: 'separator' },
        process.platform === 'darwin' ? { role: 'close' } : { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Undo', accelerator: 'CmdOrCtrl+Z', click: () => sendToFocused('menu:undo') },
        { label: 'Redo', accelerator: 'CmdOrCtrl+Shift+Z', click: () => sendToFocused('menu:redo') }
      ]
    },
    ...(process.platform === 'darwin'
      ? [{
          label: app.name,
          submenu: [
            { label: `About ${app.name}`, role: 'about' as const },
            { type: 'separator' as const },
            { role: 'services' as const },
            { type: 'separator' as const },
            { role: 'hide' as const },
            { role: 'hideOthers' as const },
            { role: 'unhide' as const },
            { type: 'separator' as const },
            { role: 'quit' as const }
          ]
        }]
      : []),
    {
      label: 'Help',
      submenu: [
        {
          label: 'Check for Updates…',
          click: () => {
            if (is.dev) {
              dialog.showMessageBox({ type: 'info', title: 'Updates', message: 'Update checking is disabled in development.' })
              return
            }
            autoUpdater.checkForUpdates()
          }
        }
      ]
    }
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

// --- Auto Updater ---

function setupAutoUpdater(mainWindow: BrowserWindow): void {
  if (is.dev) return

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', (info) => {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update Available',
      message: `POTool ${info.version} is available`,
      detail: 'The update is downloading in the background and will be ready shortly.',
      buttons: ['OK']
    })
  })

  autoUpdater.on('update-downloaded', () => {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update Ready to Install',
      message: 'A new version of POTool has been downloaded.',
      detail: 'Restart now to apply the update, or it will be applied next time you launch.',
      buttons: ['Restart Now', 'Later'],
      defaultId: 0
    }).then(({ response }) => {
      if (response === 0) autoUpdater.quitAndInstall()
    })
  })

  autoUpdater.on('error', (err) => {
    console.error('Auto-updater error:', err)
  })

  // Delay initial check so it doesn't race with window creation
  setTimeout(() => autoUpdater.checkForUpdates(), 3000)
}

// --- IPC Handlers ---

function registerIpcHandlers(): void {
  // Open file dialog for audio import
  ipcMain.handle('dialog:openAudioFile', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Import Audio',
      filters: [
        { name: 'Audio Files', extensions: ['wav', 'mp3', 'aiff', 'aif', 'flac', 'ogg'] }
      ],
      properties: ['openFile']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  // Read file as ArrayBuffer
  ipcMain.handle('fs:readFile', async (_, filePath: string) => {
    const buffer = await readFile(filePath)
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
  })

  // Save WAV export
  ipcMain.handle('dialog:saveWav', async (_, arrayBuffer: ArrayBuffer) => {
    const result = await dialog.showSaveDialog({
      title: 'Export WAV',
      defaultPath: 'samples.wav',
      filters: [{ name: 'WAV Audio', extensions: ['wav'] }]
    })
    if (result.canceled || !result.filePath) return false
    await writeFile(result.filePath, Buffer.from(arrayBuffer))
    return true
  })

  // Open project folder
  ipcMain.handle('dialog:openProject', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Open Project',
      properties: ['openDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  // Save project to folder
  ipcMain.handle('dialog:saveProjectAs', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Choose Project Folder',
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  // List filenames in a folder
  ipcMain.handle('fs:readDir', async (_, folderPath: string) => {
    return readdir(folderPath)
  })

  // Read project.json from a folder
  ipcMain.handle('project:load', async (_, folderPath: string) => {
    const jsonPath = join(folderPath, 'project.json')
    if (!existsSync(jsonPath)) return null
    const data = await readFile(jsonPath, 'utf-8')
    return JSON.parse(data)
  })

  // Write a raw file (e.g. exported WAV for merged pads) into a project folder
  ipcMain.handle('project:writeFile', async (_, folderPath: string, filename: string, data: ArrayBuffer) => {
    if (!existsSync(folderPath)) {
      await mkdir(folderPath, { recursive: true })
    }
    await writeFile(join(folderPath, filename), Buffer.from(data))
  })

  // Save project.json + copy audio files
  ipcMain.handle(
    'project:save',
    async (_, folderPath: string, projectJson: string, filesToCopy: { src: string; dest: string }[]) => {
      // Ensure folder exists
      if (!existsSync(folderPath)) {
        await mkdir(folderPath, { recursive: true })
      }

      // Copy audio files into project folder
      for (const { src, dest } of filesToCopy) {
        const destPath = join(folderPath, dest)
        if (!existsSync(destPath)) {
          await copyFile(src, destPath)
        }
      }

      // Write project.json
      await writeFile(join(folderPath, 'project.json'), projectJson, 'utf-8')
      return true
    }
  )
}

// --- App Lifecycle ---

// Disable macOS overlay scrollbars so the waveform editor scrollbar
// doesn't grow/turn white on hover (Chromium overlay scrollbar behaviour)
app.commandLine.appendSwitch('disable-features', 'OverlayScrollbar')

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.andreaskinga.potool')

  if (process.platform === 'darwin') {
    app.setAboutPanelOptions({
      applicationName: 'POTool',
      applicationVersion: app.getVersion(),
      version: '',
      copyright: `© ${new Date().getFullYear()} Andreas King`,
      website: 'https://github.com/andreaskinga-lgtm/POTool'
    })
  }

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerIpcHandlers()
  buildMenu()
  const mainWindow = createWindow()
  setupAutoUpdater(mainWindow)

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
