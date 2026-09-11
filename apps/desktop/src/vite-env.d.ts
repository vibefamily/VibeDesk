/// <reference types="vite/client" />

/**
 * Type declarations for the Vite environment.
 */

interface ImportMetaEnv {
  readonly VITE_APP_TITLE: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/**
 * Types for the preload-exposed API.
 * Keep in sync with electron/preload/index.ts
 */
interface WalletApiType {
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
  deriveMore: (args: { hdWalletId: string; count: number; password: string }) => Promise<
    { index: number; name: string; address: string }[]
  >
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
  exportMnemonic: (args: { walletId: string; password: string }) => Promise<string>
  exportPrivateKey: (args: {
    walletId: string
    password: string
    index?: number
  }) => Promise<string>
  exportKeystore: (args: { walletId: string; password: string }) => Promise<Record<string, unknown>>
  authorizeAgent: (args: {
    walletId: string
    password: string
    index?: number
  }) => Promise<{ authorized: string[] }>
  revokeAgent: (args: { walletId: string; index?: number }) => Promise<{ authorized: string[] }>
  revokeAll: () => Promise<{ authorized: string[] }>
  remove: (args: { walletId: string }) => Promise<{ wallets: WalletMeta[] }>
}

interface AgentTemplateApiType {
  id: string
  name: string
  description: string
  icon: string
  defaultIntervalMs: number
  defaultSymbols: string[]
  tools: string[]
}

interface AgentInstanceApiType {
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
  messages: { id: string; at: number; kind: string; content: string }[]
}

interface AgentApiType {
  listTemplates: () => Promise<AgentTemplateApiType[]>
  list: () => Promise<AgentInstanceApiType[]>
  getMode: () => Promise<'llm' | 'rule'>
  create: (args: { templateId: string; name?: string; symbols?: string[] }) => Promise<AgentInstanceApiType>
  start: (args: { id: string }) => Promise<AgentInstanceApiType | null>
  stop: (args: { id: string }) => Promise<AgentInstanceApiType | null>
  remove: (args: { id: string }) => Promise<AgentInstanceApiType[]>
  runOnce: (args: { id: string }) => Promise<AgentInstanceApiType | null>
  setLlmConfig: (config: { baseUrl: string; apiKey: string; model: string } | null) => Promise<{ mode: 'llm' | 'rule' }>
  getLlmConfig: () => Promise<{ baseUrl: string; apiKey: string; model: string } | null>
}

interface VibeAPI {
  getAppInfo: () => Promise<{ version: string; name: string; platform: string }>
  ping: () => Promise<string>
  wallet: WalletApiType
  agent: AgentApiType
  on: (channel: string, callback: (...args: unknown[]) => void) => void
}

interface Window {
  vibeAPI: VibeAPI
}
