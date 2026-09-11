/**
 * Electron preload script.
 *
 * Exposes a safe, limited API to the renderer process via contextBridge.
 * All IPC communication goes through this layer. Wallet secrets are
 * handled in the main process; the renderer only receives metadata.
 */

import { contextBridge, ipcRenderer } from 'electron'
import type { WalletMeta } from '@vibe/core'

/** Wallet IPC surface exposed to the renderer. */
export interface WalletApi {
  getState: () => Promise<{
    unlocked: boolean
    empty: boolean
    wallets: WalletMeta[]
    authorized: string[]
  }>
  unlock: (password: string) => Promise<{ unlocked: boolean }>
  lock: () => Promise<{ unlocked: boolean }>
  createHd: (args: {
    name: string
    password: string
    passphrase?: string
    accountCount?: number
  }) => Promise<{ mnemonic: string; wallet: WalletMeta }>
  importHd: (args: {
    name: string
    mnemonic: string
    password: string
    passphrase?: string
    accountCount?: number
  }) => Promise<{ mnemonic: string; wallet: WalletMeta }>
  deriveMore: (args: {
    hdWalletId: string
    count: number
    password: string
  }) => Promise<WalletMeta['accounts']>
  importPrivateKey: (args: {
    name: string
    privateKey: string
    password: string
  }) => Promise<WalletMeta>
  importKeystore: (args: {
    name: string
    keystoreJson: string
    keystorePassword: string
    password: string
  }) => Promise<WalletMeta>
  exportMnemonic: (args: {
    walletId: string
    password: string
  }) => Promise<string>
  exportPrivateKey: (args: {
    walletId: string
    password: string
    index?: number
  }) => Promise<string>
  exportKeystore: (args: {
    walletId: string
    password: string
  }) => Promise<Record<string, unknown>>
  authorizeAgent: (args: {
    walletId: string
    password: string
    index?: number
  }) => Promise<{ authorized: string[] }>
  revokeAgent: (args: {
    walletId: string
    index?: number
  }) => Promise<{ authorized: string[] }>
  revokeAll: () => Promise<{ authorized: string[] }>
  remove: (args: { walletId: string }) => Promise<{ wallets: WalletMeta[] }>
}

/**
 * API exposed to the renderer process.
 * Keep this minimal and well-typed for security.
 */
const vibeAPI = {
  // App info
  getAppInfo: () => ipcRenderer.invoke('app:getInfo'),
  ping: () => ipcRenderer.invoke('app:ping'),

  // Wallet (secrets stay in the main process)
  wallet: {
    getState: () => ipcRenderer.invoke('wallet:getState'),
    unlock: (password: string) => ipcRenderer.invoke('wallet:unlock', password),
    lock: () => ipcRenderer.invoke('wallet:lock'),
    createHd: (args: Parameters<WalletApi['createHd']>[0]) =>
      ipcRenderer.invoke('wallet:createHd', args),
    importHd: (args: Parameters<WalletApi['importHd']>[0]) =>
      ipcRenderer.invoke('wallet:importHd', args),
    deriveMore: (args: Parameters<WalletApi['deriveMore']>[0]) =>
      ipcRenderer.invoke('wallet:deriveMore', args),
    importPrivateKey: (args: Parameters<WalletApi['importPrivateKey']>[0]) =>
      ipcRenderer.invoke('wallet:importPrivateKey', args),
    importKeystore: (args: Parameters<WalletApi['importKeystore']>[0]) =>
      ipcRenderer.invoke('wallet:importKeystore', args),
    exportMnemonic: (args: Parameters<WalletApi['exportMnemonic']>[0]) =>
      ipcRenderer.invoke('wallet:exportMnemonic', args),
    exportPrivateKey: (args: Parameters<WalletApi['exportPrivateKey']>[0]) =>
      ipcRenderer.invoke('wallet:exportPrivateKey', args),
    exportKeystore: (args: Parameters<WalletApi['exportKeystore']>[0]) =>
      ipcRenderer.invoke('wallet:exportKeystore', args),
    authorizeAgent: (args: Parameters<WalletApi['authorizeAgent']>[0]) =>
      ipcRenderer.invoke('wallet:authorizeAgent', args),
    revokeAgent: (args: Parameters<WalletApi['revokeAgent']>[0]) =>
      ipcRenderer.invoke('wallet:revokeAgent', args),
    revokeAll: () => ipcRenderer.invoke('wallet:revokeAll'),
    remove: (args: { walletId: string }) =>
      ipcRenderer.invoke('wallet:remove', args),
  } satisfies WalletApi,

  // Event listeners
  on: (channel: string, callback: (...args: unknown[]) => void) => {
    const validChannels = ['market:tick', 'order:update', 'agent:proposal']
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (_event, ...args) => callback(...args))
    }
  },
}

contextBridge.exposeInMainWorld('vibeAPI', vibeAPI)

export type VibeAPI = typeof vibeAPI
