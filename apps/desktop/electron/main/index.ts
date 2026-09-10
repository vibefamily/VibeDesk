/**
 * Electron main process.
 *
 * Creates the browser window, sets up IPC communication with the renderer,
 * and initializes the Vibe trading core.
 */

import { app, BrowserWindow, ipcMain, shell } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// The built directory structure
//
// ├─┬─┬ dist-electron
// │ │ └── main
// │ │   └── index.js
// │ └── preload
// │   └── index.js
// ├─┬ dist
// │ └── index.html

const DIST_ELECTRON = path.join(__dirname, '..')
const DIST = path.join(DIST_ELECTRON, '../dist')
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

let win: BrowserWindow | null = null

function createWindow() {
  win = new BrowserWindow({
    title: 'Vibe - AI Trading Agent',
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    frame: true,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(DIST_ELECTRON, 'preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  })

  // Open external links in the default browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(DIST, 'index.html'))
  }
}

// --- IPC handlers ---

function setupIpcHandlers() {
  // App info
  ipcMain.handle('app:getInfo', () => ({
    version: app.getVersion(),
    name: app.getName(),
    platform: process.platform,
  }))

  // Ping / health check
  ipcMain.handle('app:ping', () => 'pong')
}

// --- App lifecycle ---

app.whenReady().then(() => {
  setupIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// Quit cleanly
app.on('before-quit', () => {
  // Clean up resources
  win = null
})
