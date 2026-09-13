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
  lastAnalysis: {
    symbol: string
    action: 'BUY' | 'SELL' | 'HOLD'
    confidence: number
    summary: string
    reasons: string[]
    risks: string[]
    spreadPct: number | null
    change24hPct: number | null
    sourceCount: number
    analyzedAt: number
  } | null
  messages: {
    id: string
    at: number
    kind: string
    content: string
    role?: 'user' | 'agent'
  }[]
  dataSources: string[]
  walletAuths: string[]
  skills: string[]
  desktopIcon: boolean
}

interface ArcApiType {
  getNetwork: () => Promise<{
    network: 'testnet' | 'mainnet'
    name: string
    chainId: number
    mainnetReady: boolean
  }>
  setNetwork: (network: string) => Promise<{
    network: 'testnet' | 'mainnet'
    name: string
    chainId: number
    mainnetReady: boolean
  }>
  quote: (args: { token: string; zeroForOne: boolean; amountIn: string; hooks?: string }) => Promise<{
    amountOut: string
    decimals: number
  }>
  balances: (args: { walletId: string; index?: number; token: string }) => Promise<{
    nativeUsdc: string
    token: string
  }>
  swap: (args: {
    walletId: string
    index?: number
    token: string
    zeroForOne: boolean
    amountIn: string
    amountOutMinimum: string
    hooks?: string
  }) => Promise<{ hash: string }>
  waitReceipt: (hash: string) => Promise<{ status: 'success' | 'reverted' }>
}

interface SkillsApiType {
  list: () => Promise<
    {
      id: string
      name: string
      description: string
      icon: string
      kind: 'data-source' | 'tool-set'
      authRequired: boolean
      configuredKeys: string[]
      configFields: { key: string; label: string; secret: boolean; placeholder?: string }[]
    }[]
  >
  saveConfig: (args: { skillId: string; config: Record<string, string> }) => Promise<{
    skills: unknown[]
    requiresRestart: boolean
  }>
  testConnection: (args: { skillId: string; config: Record<string, string> }) => Promise<{
    ok: boolean
    message: string
  }>
}

interface AgentApiType {
  listDataSources: () => Promise<string[]>
  setDataSourceAuth: (args: { id: string; dataSources: string[] }) => Promise<AgentInstanceApiType | null>
  setWalletAuth: (args: { id: string; walletAuths: string[] }) => Promise<AgentInstanceApiType | null>
  setSkills: (args: { id: string; skills: string[] }) => Promise<AgentInstanceApiType | null>
  listSkills: () => Promise<{ id: string; name: string; description: string; icon: string }[]>
  listTemplates: () => Promise<AgentTemplateApiType[]>
  list: () => Promise<AgentInstanceApiType[]>
  getMode: () => Promise<'llm' | 'rule'>
  create: (args: {
    templateId: string
    name?: string
    symbols?: string[]
    desktopIcon?: boolean
  }) => Promise<AgentInstanceApiType>
  start: (args: { id: string }) => Promise<AgentInstanceApiType | null>
  stop: (args: { id: string }) => Promise<AgentInstanceApiType | null>
  setIntervalMs: (args: { id: string; intervalMs: number }) => Promise<AgentInstanceApiType | null>
  remove: (args: { id: string }) => Promise<AgentInstanceApiType[]>
  clearMessages: (args: { id: string }) => Promise<AgentInstanceApiType | null>
  runOnce: (args: { id: string }) => Promise<AgentInstanceApiType | null>
  setLlmConfig: (config: { baseUrl: string; apiKey: string; model: string } | null) => Promise<{ mode: 'llm' | 'rule' }>
  setLlmModel: (model: string) => Promise<{ baseUrl: string; apiKey: string; model: string } | null>
  listProviders: () => Promise<
    {
      id: string
      name: string
      api: 'openai-completions' | 'anthropic-messages' | 'google-generative-ai'
      baseUrl: string
      models: string[]
      model: string
      active: boolean
      hasKey: boolean
    }[]
  >
  saveProvider: (input: {
    id?: string
    name: string
    api: 'openai-completions' | 'anthropic-messages' | 'google-generative-ai'
    baseUrl: string
    apiKey?: string
    models: string[]
    model: string
    active?: boolean
  }) => Promise<{
    id: string
    name: string
    api: 'openai-completions' | 'anthropic-messages' | 'google-generative-ai'
    baseUrl: string
    models: string[]
    model: string
    active: boolean
    hasKey: boolean
  }>
  activateProvider: (id: string) => Promise<
    {
      id: string
      name: string
      api: 'openai-completions' | 'anthropic-messages' | 'google-generative-ai'
      baseUrl: string
      models: string[]
      model: string
      active: boolean
      hasKey: boolean
    }[]
  >
  removeProvider: (id: string) => Promise<
    {
      id: string
      name: string
      api: 'openai-completions' | 'anthropic-messages' | 'google-generative-ai'
      baseUrl: string
      models: string[]
      model: string
      active: boolean
      hasKey: boolean
    }[]
  >
  setAgentModel: (args: { id: string; model: string }) => Promise<AgentInstanceApiType | null>
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
  history: (args: {
    symbol: string
    providers?: string[]
    from?: number
    to?: number
  }) => Promise<HistorySeriesApiType[]>
  candles: (args: {
    symbol: string
    timeframe: string
    limit?: number
  }) => Promise<CandleApiType[]>
}

interface CandleApiType {
  timestamp: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

interface HistorySeriesApiType {
  provider: string
  points: { ts: number; price: number }[]
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
  arc: ArcApiType
  skills: SkillsApiType
  agent: AgentApiType
  market: MarketApiType
  info: InfoApiType
  on: (
    channel: string,
    callback: (...args: unknown[]) => void,
  ) => (() => void) | void
  off: (channel: string, callback: (...args: unknown[]) => void) => void
}

interface Window {
  vibeAPI: VibeAPI
}
