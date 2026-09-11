/**
 * Electron main process.
 *
 * Creates the browser window, sets up IPC communication with the renderer,
 * and owns the wallet vault (private keys never leave this process).
 */

import { app, BrowserWindow, ipcMain, shell } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { VaultWalletManager } from '@vibe/core'

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

// --- Wallet vault (main process only) ---
let walletManager: VaultWalletManager | null = null

function getWalletManager(): VaultWalletManager {
  if (!walletManager) {
    const vaultPath = path.join(app.getPath('userData'), 'vault.json')
    walletManager = new VaultWalletManager(vaultPath)
    walletManager.load()
  }
  return walletManager
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

  // --- Wallet IPC ---

  /** Read-only snapshot of the wallet state for the renderer. */
  ipcMain.handle('wallet:getState', () => {
    const vault = getWalletManager()
    return {
      unlocked: vault.isUnlocked(),
      empty: vault.isEmpty(),
      wallets: vault.listWallets(),
      authorized: vault.listAuthorized(),
    }
  })

  ipcMain.handle('wallet:unlock', (_e, password: string) => {
    const vault = getWalletManager()
    if (vault.isEmpty()) {
      // First run: nothing to unlock against; treat as armed but locked.
      // Caller should create a wallet first.
      throw new Error('No wallets yet - create or import one first')
    }
    vault.unlock(password)
    return { unlocked: true }
  })

  ipcMain.handle('wallet:lock', () => {
    getWalletManager().lock()
    return { unlocked: false }
  })

  ipcMain.handle(
    'wallet:createHd',
    (
      _e,
      args: {
        name: string
        password: string
        passphrase?: string
        accountCount?: number
      },
    ) => {
      const vault = getWalletManager()
      vault.unlock(args.password)
      const result = vault.createHdWallet(args.name, args.password, {
        passphrase: args.passphrase,
        accountCount: args.accountCount ?? 1,
      })
      return result
    },
  )

  ipcMain.handle(
    'wallet:importHd',
    (
      _e,
      args: {
        name: string
        mnemonic: string
        password: string
        passphrase?: string
        accountCount?: number
      },
    ) => {
      const vault = getWalletManager()
      vault.unlock(args.password)
      return vault.importHdWallet(args.name, args.mnemonic, args.password, {
        passphrase: args.passphrase,
        accountCount: args.accountCount ?? 1,
      })
    },
  )

  ipcMain.handle(
    'wallet:deriveMore',
    (_e, args: { hdWalletId: string; count: number; password: string }) => {
      const vault = getWalletManager()
      vault.unlock(args.password)
      return vault.deriveMoreAccounts(args.hdWalletId, args.count, args.password)
    },
  )

  ipcMain.handle(
    'wallet:importPrivateKey',
    (_e, args: { name: string; privateKey: string; password: string }) => {
      const vault = getWalletManager()
      vault.unlock(args.password)
      return vault.importPrivateKey(args.name, args.privateKey, args.password)
    },
  )

  ipcMain.handle(
    'wallet:importKeystore',
    (
      _e,
      args: {
        name: string
        keystoreJson: string
        keystorePassword: string
        password: string
      },
    ) => {
      const vault = getWalletManager()
      vault.unlock(args.password)
      return vault.importKeystore(
        args.name,
        args.keystoreJson,
        args.keystorePassword,
        args.password,
      )
    },
  )

  ipcMain.handle(
    'wallet:exportMnemonic',
    (_e, args: { walletId: string; password: string }) => {
      const vault = getWalletManager()
      vault.unlock(args.password)
      return vault.exportMnemonic(args.walletId, args.password)
    },
  )

  ipcMain.handle(
    'wallet:exportPrivateKey',
    (_e, args: { walletId: string; password: string; index?: number }) => {
      const vault = getWalletManager()
      vault.unlock(args.password)
      return vault.exportPrivateKey(args.walletId, args.password, args.index)
    },
  )

  ipcMain.handle(
    'wallet:exportKeystore',
    (_e, args: { walletId: string; password: string }) => {
      const vault = getWalletManager()
      vault.unlock(args.password)
      return vault.exportKeystore(args.walletId, args.password)
    },
  )

  ipcMain.handle(
    'wallet:authorizeAgent',
    (_e, args: { walletId: string; password: string; index?: number }) => {
      const vault = getWalletManager()
      vault.unlock(args.password)
      vault.authorizeAgent(args.walletId, args.password, args.index)
      return { authorized: vault.listAuthorized() }
    },
  )

  ipcMain.handle(
    'wallet:revokeAgent',
    (_e, args: { walletId: string; index?: number }) => {
      getWalletManager().revokeAgent(args.walletId, args.index)
      return { authorized: getWalletManager().listAuthorized() }
    },
  )

  ipcMain.handle('wallet:revokeAll', () => {
    getWalletManager().revokeAllAgents()
    return { authorized: [] }
  })

  ipcMain.handle('wallet:remove', (_e, args: { walletId: string }) => {
    getWalletManager().removeWallet(args.walletId)
    return { wallets: getWalletManager().listWallets() }
  })
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
  // Drop all in-memory keys on quit
  walletManager?.lock()
  win = null
})
