/**
 * Electron preload script.
 *
 * Exposes a safe, limited API to the renderer process via contextBridge.
 * All IPC communication goes through this layer. Wallet secrets are
 * handled in the main process; the renderer only receives metadata.
 */

import { contextBridge, ipcRenderer } from 'electron'
import type { WalletMeta } from '@vibe/core/wallet'
import type { StockAnalysis } from '@vibe/agent-plugins'

/** Template metadata exposed to the renderer (functions stripped). */
export interface AgentTemplateView {
  id: string
  name: string
  description: string
  icon: string
  defaultIntervalMs: number
  defaultSymbols: string[]
  tools: string[]
}

/** Agent instance view returned by the main process. */
export interface AgentInstanceView {
  id: string
  templateId: string
  name: string
  icon: string
  status: 'idle' | 'running' | 'completed' | 'error' | 'stopped'
  mode: 'llm' | 'rule'
  symbols: string[]
  intervalMs: number
  createdAt: number
  lastRunAt: number | null
  lastMessage: string | null
  lastAnalysis: StockAnalysis | null
  messages: { id: string; at: number; kind: string; content: string }[]
}

/** Agent event pushed from the main process. */
export interface AgentEvent {
  type: 'status' | 'step' | 'message' | 'error' | 'analysis'
  agentId: string
  content?: string
  message?: string
  status?: string
  analysis?: StockAnalysis
  at: number
}

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

  // Agents (managed in the main process)
  arc: {
    getNetwork: () => ipcRenderer.invoke('arc:getNetwork'),
    setNetwork: (network: string) => ipcRenderer.invoke('arc:setNetwork', network),
    quote: (args: { token: string; zeroForOne: boolean; amountIn: string; hooks?: string }) =>
      ipcRenderer.invoke('arc:quote', args),
    balances: (args: { walletId: string; index?: number; token: string }) =>
      ipcRenderer.invoke('arc:balances', args),
    swap: (args: {
      walletId: string
      index?: number
      token: string
      zeroForOne: boolean
      amountIn: string
      amountOutMinimum: string
      hooks?: string
    }) => ipcRenderer.invoke('arc:swap', args),
    waitReceipt: (hash: string) => ipcRenderer.invoke('arc:waitReceipt', hash),
  },
  skills: {
    list: () => ipcRenderer.invoke('skills:list'),
    saveConfig: (args: { skillId: string; config: Record<string, string> }) =>
      ipcRenderer.invoke('skills:saveConfig', args),
    testConnection: (args: { skillId: string; config: Record<string, string> }) =>
      ipcRenderer.invoke('skills:testConnection', args),
  },
  agent: {
    listDataSources: () => ipcRenderer.invoke('agent:listDataSources'),
    setDataSourceAuth: (args: { id: string; dataSources: string[] }) =>
      ipcRenderer.invoke('agent:setDataSourceAuth', args),
    setWalletAuth: (args: { id: string; walletAuths: string[] }) =>
      ipcRenderer.invoke('agent:setWalletAuth', args),

    listTemplates: () => ipcRenderer.invoke('agent:listTemplates'),
    list: () => ipcRenderer.invoke('agent:list'),
    getMode: () => ipcRenderer.invoke('agent:getMode'),
    create: (args: { templateId: string; name?: string; symbols?: string[] }) =>
      ipcRenderer.invoke('agent:create', args),
    start: (args: { id: string }) => ipcRenderer.invoke('agent:start', args),
    stop: (args: { id: string }) => ipcRenderer.invoke('agent:stop', args),
    setIntervalMs: (args: { id: string; intervalMs: number }) =>
      ipcRenderer.invoke('agent:setIntervalMs', args),
    remove: (args: { id: string }) => ipcRenderer.invoke('agent:remove', args),
    clearMessages: (args: { id: string }) => ipcRenderer.invoke('agent:clearMessages', args),
    runOnce: (args: { id: string }) => ipcRenderer.invoke('agent:runOnce', args),
    setLlmConfig: (config: {
      baseUrl: string
      apiKey: string
      model: string
    } | null) => ipcRenderer.invoke('agent:setLlmConfig', config),
    getLlmConfig: () => ipcRenderer.invoke('agent:getLlmConfig'),
    chat: (id: string, text: string) => ipcRenderer.invoke('agent:chat', { id, text }),
    probeOllama: () => ipcRenderer.invoke('agent:probeOllama'),
    testConnection: (config: { baseUrl: string; apiKey: string; model: string }) =>
      ipcRenderer.invoke('agent:testConnection', config),
  },

  // Market data (sources run in the main process)
  market: {
    getState: () => ipcRenderer.invoke('market:getState'),
    refreshSymbol: (symbol: string) =>
      ipcRenderer.invoke('market:refreshSymbol', symbol),
    history: (args: {
      symbol: string
      providers?: string[]
      from?: number
      to?: number
    }) => ipcRenderer.invoke('market:history', args),
  },

  // Info Center (M3): multi-source news/tweet pulls
  info: {
    getState: () => ipcRenderer.invoke('info:getState'),
    upsertSource: (input: unknown) => ipcRenderer.invoke('info:upsertSource', input),
    deleteSource: (id: string) => ipcRenderer.invoke('info:deleteSource', id),
    refreshNow: (id?: string) => ipcRenderer.invoke('info:refreshNow', id),
    search: (query: unknown) => ipcRenderer.invoke('info:search', query),
  },

  // Event listeners
  on: (channel: string, callback: (...args: unknown[]) => void) => {
    const validChannels = [
      'market:tick',
      'order:update',
      'agent:proposal',
      'agent:event',
      'market:ticks',
      'info:event',
    ]
    if (!validChannels.includes(channel)) return
    // Keep a per-channel registry of the wrapped listeners so `off` can
    // remove exactly the listener that was registered. Without this the
    // wrapper and the raw callback never match and every subscribe leaks
    // a listener - which made agent events apply N times and duplicated
    // chat messages many-fold.
    const listener = (_event: Electron.IpcRendererEvent, ...args: unknown[]): void =>
      callback(...args)
    const registry = (ipcRenderer as unknown as {
      __vibeListeners?: Map<
        string,
        Map<(...args: unknown[]) => void, (event: Electron.IpcRendererEvent, ...args: unknown[]) => void>
      >
    }).__vibeListeners ?? new Map()
    let byCallback = registry.get(channel)
    if (!byCallback) {
      byCallback = new Map()
      registry.set(channel, byCallback)
    }
    byCallback.set(callback, listener)
    ipcRenderer.on(channel, listener)
    return () => {
      ipcRenderer.removeListener(channel, listener)
      byCallback!.delete(callback)
    }
  },
  off: (channel: string, callback: (...args: unknown[]) => void) => {
    // Resolve the wrapped listener for this exact callback (they never
    // match directly) and remove it, so listeners never leak.
    const registry = (ipcRenderer as unknown as {
      __vibeListeners?: Map<
        string,
        Map<(...args: unknown[]) => void, (event: Electron.IpcRendererEvent, ...args: unknown[]) => void>
      >
    }).__vibeListeners
    const byCallback = registry?.get(channel)
    const listener = byCallback?.get(callback)
    if (listener) {
      ipcRenderer.removeListener(channel, listener)
      byCallback?.delete(callback)
      return
    }
    ipcRenderer.removeListener(channel, callback as never)
  },
}

contextBridge.exposeInMainWorld('vibeAPI', vibeAPI)

export type VibeAPI = typeof vibeAPI
