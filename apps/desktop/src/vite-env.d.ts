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
  chat: (id: string, text: string) => Promise<AgentInstanceViewApiType>
  probeOllama: () => Promise<{ ok: boolean; models: string[]; error: string | null }>
  testConnection: (config: { baseUrl: string; apiKey: string; model: string }) => Promise<{
    ok: boolean
    reply: string | null
    error: string | null
  }>
}

interface ProviderManifestApiType {
  id: string
  name: string
  kind: string
  assetScope: string
  authRequired: boolean
  updateMode: string[]
  description: string
  privacyNote: string
}

interface TickDataApiType {
  timestamp: number
  symbol: string
  bidPrice: number
  bidSize: number
  askPrice: number
  askSize: number
  lastPrice: number
  change24h?: number | null
  volume24h?: number | null
}

interface MarketApiType {
  getState: () => Promise<{
    ready: boolean
    manifests: ProviderManifestApiType[]
    ticks: Record<string, Record<string, TickDataApiType>>
    unavailable: Record<string, string[]>
    lastUpdated: number
  }>
  refreshSymbol: (symbol: string) => Promise<{
    ticks: Record<string, Record<string, TickDataApiType>>
    unavailable: Record<string, string[]>
    lastUpdated: number
  }>
}

interface InfoApiType {
  getState: () => Promise<InfoStateApiType>
  upsertSource: (input: Partial<InfoSourceConfigApiType> & { id?: string }) => Promise<InfoStateApiType>
  deleteSource: (id: string) => Promise<InfoStateApiType>
  refreshNow: (id?: string) => Promise<InfoStateApiType>
  search: (query: InfoSearchQueryApiType) => Promise<InfoItemApiType[]>
}

interface InfoSourceConfigApiType {
  id: string
  kind: 'rss' | 'twitter'
  name: string
  enabled: boolean
  url?: string
  symbols: string[]
  keywords?: string[]
  intervalMinutes: number
}

interface InfoItemApiType {
  id: string
  sourceId: string
  sourceName: string
  kind: 'news' | 'tweet'
  title: string
  url: string
  summary?: string
  author?: string
  publishedAt: string
  fetchedAt: string
  symbols: string[]
}

interface InfoSourceStatusApiType {
  sourceId: string
  lastPullAt: number | null
  lastCount: number
  error: string | null
}

interface InfoStateApiType {
  sources: InfoSourceConfigApiType[]
  statuses: Record<string, InfoSourceStatusApiType>
  items: InfoItemApiType[]
}

interface InfoSearchQueryApiType {
  query?: string
  symbols?: string[]
  kind?: 'news' | 'tweet'
  limit?: number
}

interface VibeAPI {
  getAppInfo: () => Promise<{ version: string; name: string; platform: string }>
  ping: () => Promise<string>
  wallet: WalletApiType
  agent: AgentApiType
  market: MarketApiType
  info: InfoApiType
  setTitleBarStyle: (style: 'hiddenInset' | 'default') => Promise<'hiddenInset' | 'default'>
  on: (
    channel: string,
    callback: (...args: unknown[]) => void,
  ) => (() => void) | void
  off: (channel: string, callback: (...args: unknown[]) => void) => void
}

interface Window {
  vibeAPI: VibeAPI
}
