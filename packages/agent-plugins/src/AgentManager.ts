/**
 * AgentManager - multi-agent lifecycle management.
 *
 * Owns templates and live agent instances, runs agents on a schedule,
 * and fans events (status / steps / final messages / errors) out to
 * subscribers (the Electron main process forwards them to the UI).
 *
 * Two execution modes:
 * - LLM mode: a configured OpenAI-compatible key -> ReAct agent with
 *   tool calling (market, wallet-read, news).
 * - Rule mode: no key configured -> deterministic analysis from live
 *   multi-source prices, so the demo always produces real output.
 */

import { MarketDataAggregator } from '@vibe/core'
import { generateId } from '@vibe/shared/utils'
import type { CandleData, OrderBookData, TickData } from '@vibe/shared'
import { Agent } from './runtime/Agent'
import type { AgentConfig, LLMProvider } from './runtime/types'
import type { AgentTemplate } from './templates'
import { BUILTIN_TEMPLATES } from './templates'
import { OpenAICompatibleProvider } from './llm/OpenAICompatibleProvider'
import type { OpenAIConfig } from './llm/OpenAICompatibleProvider'
import { JsonFileAgentStorage } from './storage/types'
import type { AgentStorage } from './storage/types'
import { createMarketTools, type MarketToolsSource } from './tools/marketTools'
import { createNewsTool } from './tools/newsTools'
import { createInfoReadTool } from './tools/infoTools'
import type { InfoStore } from './tools/infoTools'
import { createWalletReadTool } from './tools/walletTools'
import type { WalletReadAccess } from './tools/walletTools'
import { analyzeStock } from './analysis/ruleAnalyst'
import type { StockAnalysis } from './analysis/ruleAnalyst'

/** Execution mode of an agent instance. */
export type AgentMode = 'llm' | 'rule'

/** Agent status exposed to the UI. */
export type AgentViewStatus = 'idle' | 'running' | 'completed' | 'error' | 'stopped'

/** Message line shown in the agent output panel. */
export interface AgentMessageView {
  id: string
  at: number
  kind: 'run' | 'step' | 'message' | 'error'
  content: string
  /** Sender for chat bubbles (user vs agent). */
  role?: 'user' | 'agent'
}

/** UI-facing view of an agent instance. */
export interface AgentInstanceView {
  id: string
  templateId: string
  name: string
  icon: string
  status: AgentViewStatus
  mode: AgentMode
  symbols: string[]
  intervalMs: number
  createdAt: number
  lastRunAt: number | null
  /** Latest final message content */
  lastMessage: string | null
  /** Recent output lines (capped) */
  messages: AgentMessageView[]
  /** Data source ids this agent may query (empty = all registered). */
  dataSources: string[]
  /** Authorized wallet keys this agent may read (walletId:index, empty = none). */
  walletAuths: string[]
  /** Whether a desktop shortcut should be shown on the VibeDesk home desktop. */
  desktopIcon: boolean
}

/** Events emitted by the AgentManager. */
export type AgentManagerEvent =
  | { type: 'status'; agentId: string; status: AgentViewStatus; at: number }
  | { type: 'step'; agentId: string; content: string; at: number }
  | { type: 'message'; agentId: string; content: string; at: number }
  | { type: 'error'; agentId: string; message: string; at: number }

type Listener = (event: AgentManagerEvent) => void

interface ManagedAgent {
  template: AgentTemplate
  view: AgentInstanceView
  agent: Agent | null
  timer: ReturnType<typeof setInterval> | null
  symbols: string[]
  running: boolean
}

const MAX_MESSAGES = 500

export interface AgentManagerOptions {
  /** Aggregator with live data sources (used by market tools + rule mode). */
  market: MarketDataAggregator
  /** Read-only wallet access (authorized wallets only). */
  walletAccess?: WalletReadAccess
  /** Local information store (Info Center cache); enables read_information. */
  infoStore?: InfoStore
  /** Storage backend for agent instances (M5). Defaults to JSON files
   *  under agentsDir when only agentsDir is given. */
  storage?: AgentStorage
  /** Directory to persist agent instances (M5) - shorthand that builds a
   *  JsonFileAgentStorage. When omitted, agents stay in-memory only. */
  agentsDir?: string
}

export class AgentManager {
  private templates = new Map<string, AgentTemplate>()
  private agents = new Map<string, ManagedAgent>()
  private listeners = new Set<Listener>()
  private market: MarketDataAggregator
  private walletAccess?: WalletReadAccess
  private infoStore?: InfoStore
  private llmProvider: OpenAICompatibleProvider | null = null
  private storage: AgentStorage | null = null
  private saveTimers = new Map<string, ReturnType<typeof setTimeout>>()

  constructor(options: AgentManagerOptions) {
    this.market = options.market
    this.walletAccess = options.walletAccess
    this.infoStore = options.infoStore
    if (options.storage) {
      this.storage = options.storage
    } else if (options.agentsDir) {
      try {
        this.storage = new JsonFileAgentStorage(options.agentsDir)
      } catch {
        this.storage = null
      }
    }
    for (const t of BUILTIN_TEMPLATES) {
      this.registerTemplate(t)
    }
  }

  // --- Templates ---

  registerTemplate(template: AgentTemplate): void {
    this.templates.set(template.id, template)
  }

  listTemplates(): AgentTemplate[] {
    return Array.from(this.templates.values())
  }

  getTemplate(id: string): AgentTemplate | undefined {
    return this.templates.get(id)
  }

  // --- LLM configuration ---

  /** Configure (or clear) the OpenAI-compatible LLM provider. */
  setLlmConfig(config: OpenAIConfig | null): void {
    if (!config || !config.apiKey || !config.baseUrl) {
      this.llmProvider = null
      return
    }
    if (this.llmProvider) {
      this.llmProvider.updateConfig(config)
    } else {
      this.llmProvider = new OpenAICompatibleProvider(config)
    }
  }

  getLlmConfig(): OpenAIConfig | null {
    return this.llmProvider?.getConfig() ?? null
  }

  getMode(): AgentMode {
    return this.llmProvider ? 'llm' : 'rule'
  }

  // --- Persistence (per-agent JSON in agentsDir) ---

  /** Schedule a debounced write of the agent instance. */
  private persist(id: string): void {
    if (!this.storage) return
    const existing = this.saveTimers.get(id)
    if (existing) clearTimeout(existing)
    this.saveTimers.set(
      id,
      setTimeout(() => {
        this.saveTimers.delete(id)
        const managed = this.agents.get(id)
        if (!managed) return
        try {
          this.storage!.saveAgent(id, {
            view: managed.view,
            running: managed.view.status === 'running',
          })
        } catch (err) {
          console.error('[agents] persist failed:', err)
        }
      }, 150),
    )
  }

  private removePersisted(id: string): void {
    if (!this.storage) return
    const t = this.saveTimers.get(id)
    if (t) {
      clearTimeout(t)
      this.saveTimers.delete(id)
    }
    this.storage.removeAgent(id)
  }

  /** Restore persisted agents (call once at startup, after LLM config).
   *  Agents that were running before shutdown resume their timers. */
  restoreAll(): void {
    if (!this.storage) return
    for (const raw of this.storage.loadAgents()) {
      try {
        const view = raw.view as Partial<AgentInstanceView>
        if (!view?.id || !view.templateId) continue
        const template = this.templates.get(view.templateId)
        if (!template) continue
        const managed: ManagedAgent = {
          template,
          view: {
            id: view.id,
            templateId: view.templateId,
            name: view.name ?? template.name,
            icon: view.icon ?? template.icon,
            status: view.status ?? 'idle',
            mode: view.mode ?? this.getMode(),
            symbols: Array.isArray(view.symbols) ? view.symbols : [...template.defaultSymbols],
            intervalMs: typeof view.intervalMs === 'number' ? view.intervalMs : template.defaultIntervalMs,
            createdAt: typeof view.createdAt === 'number' ? view.createdAt : Date.now(),
            lastRunAt: typeof view.lastRunAt === 'number' ? view.lastRunAt : null,
            lastMessage: typeof view.lastMessage === 'string' ? view.lastMessage : null,
            messages: Array.isArray(view.messages)
              ? view.messages.slice(-MAX_MESSAGES)
              : [],
            dataSources: Array.isArray(view.dataSources) ? view.dataSources : [],
            walletAuths: Array.isArray(view.walletAuths) ? view.walletAuths : [],
            desktopIcon: view.desktopIcon === true,
          },
          agent: null,
          timer: null,
          symbols: Array.isArray(view.symbols) ? view.symbols : [...template.defaultSymbols],
          running: false,
        }
        if (this.llmProvider) managed.agent = this.buildAgent(managed)
        this.agents.set(view.id, managed)
        if (raw.running === true && managed.view.intervalMs > 0) {
          this.start(view.id)
        }
      } catch (err) {
        console.error('[agents] failed to restore agent:', err)
      }
    }
  }

  // --- Instance lifecycle ---

  create(
    templateId: string,
    options: {
      name?: string
      symbols?: string[]
      dataSources?: string[]
      walletAuths?: string[]
      desktopIcon?: boolean
    } = {},
  ): AgentInstanceView {
    const template = this.templates.get(templateId)
    if (!template) {
      throw new Error(`Unknown agent template: ${templateId}`)
    }
    const id = generateId('agt_')
    const name = options.name ?? `${template.name} ${this.agents.size + 1}`
    const symbols = options.symbols?.length
      ? options.symbols.map((s) => s.toUpperCase())
      : [...template.defaultSymbols]

    const view: AgentInstanceView = {
      id,
      templateId,
      name,
      icon: template.icon,
      status: 'idle',
      mode: this.getMode(),
      symbols,
      intervalMs: template.defaultIntervalMs,
      createdAt: Date.now(),
      lastRunAt: null,
      lastMessage: null,
      messages: [],
      dataSources: options.dataSources ?? [],
      walletAuths: options.walletAuths ?? [],
      desktopIcon: options.desktopIcon ?? false,
    }

    const managed: ManagedAgent = {
      template,
      view,
      agent: null,
      timer: null,
      symbols,
      running: false,
    }

    // Build the ReAct agent when LLM mode is available.
    if (this.llmProvider) {
      managed.agent = this.buildAgent(managed)
    }

    this.agents.set(id, managed)
    this.persist(id)
    return view
  }

  private buildAgent(managed: ManagedAgent): Agent {
    const { template, view } = managed
    const config: AgentConfig = template.buildConfig(view.id, view.name, this.llmProvider!.getConfig().model)
    const agent = new Agent(config, this.llmProvider!)
    const tools = [
      ...createMarketTools(new ScopedMarket(this.market, view.dataSources)),
      ...(this.walletAccess
        ? [createWalletReadTool(new ScopedWalletAccess(this.walletAccess, view.walletAuths))]
        : []),
      ...(this.infoStore ? [createInfoReadTool(this.infoStore)] : []),
      createNewsTool(),
    ]
    agent.registerTools(tools)
    agent.onEvent((event) => {
      if (event.type === 'step') {
        const step = event.data as { type: string; content: string; timestamp: number }
        this.pushMessage(view.id, { kind: 'step', content: step.content, at: step.timestamp })
      } else if (event.type === 'final_message') {
        this.pushMessage(view.id, { kind: 'message', content: String(event.data), at: Date.now() })
      } else if (event.type === 'error') {
        this.emit({ type: 'error', agentId: view.id, message: String(event.data), at: Date.now() })
      }
    })
    return agent
  }

  /** Restrict the data sources this agent may query (empty = all). */
  setDataSourceAuth(id: string, dataSources: string[]): void {
    const managed = this.agents.get(id)
    if (!managed) return
    managed.view.dataSources = [...new Set(dataSources)]
    if (this.llmProvider) managed.agent = this.buildAgent(managed)
    this.persist(id)
  }

  /** Restrict the authorized wallets this agent may read (empty = none). */
  setWalletAuth(id: string, walletAuths: string[]): void {
    const managed = this.agents.get(id)
    if (!managed) return
    managed.view.walletAuths = [...new Set(walletAuths)]
    if (this.llmProvider) managed.agent = this.buildAgent(managed)
    this.persist(id)
  }

  start(id: string): void {
    const managed = this.agents.get(id)
    if (!managed) throw new Error(`Unknown agent: ${id}`)
    if (managed.timer) return

    void this.runOnce(id)
    managed.timer = setInterval(() => {
      void this.runOnce(id)
    }, managed.template.defaultIntervalMs)
    this.persist(id)
  }

  /** Run one analysis cycle now (used by start and manual triggers). */
  async runOnce(id: string): Promise<void> {
    const managed = this.agents.get(id)
    if (!managed || managed.running) return
    managed.running = true
    managed.view.status = 'running'
    managed.view.lastRunAt = Date.now()
    this.emit({ type: 'status', agentId: id, status: 'running', at: Date.now() })

    try {
      const output = await this.executeCycle(managed)
      managed.view.lastMessage = output
      managed.view.status = 'completed'
      this.emit({ type: 'status', agentId: id, status: 'completed', at: Date.now() })
      this.pushMessage(id, { kind: 'message', content: output, at: Date.now() })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      managed.view.status = 'error'
      this.emit({ type: 'status', agentId: id, status: 'error', at: Date.now() })
      this.emit({ type: 'error', agentId: id, message, at: Date.now() })
      this.pushMessage(id, { kind: 'error', content: message, at: Date.now() })
    } finally {
      managed.running = false
    }
  }

  /**
   * Chat with an agent (real conversation, LLM mode only).
   * Runs the ReAct loop with the user's text; the user line and every
   * step/reply are pushed into the agent's message history.
   */
  async chat(id: string, text: string): Promise<AgentInstanceView> {
    const managed = this.agents.get(id)
    if (!managed) throw new Error(`Unknown agent: ${id}`)
    if (managed.running) throw new Error('Agent is busy with another run')
    if (!managed.agent) {
      throw new Error(
        'Chat requires LLM mode. Configure an API key or Ollama in Settings > AI Models first.',
      )
    }
    managed.running = true
    managed.view.status = 'running'
    this.emit({ type: 'status', agentId: id, status: 'running', at: Date.now() })
    this.pushMessage(id, { kind: 'message', role: 'user', content: text, at: Date.now() })
    try {
      const output = await managed.agent.run(text)
      managed.view.lastMessage = output
      managed.view.status = 'completed'
      this.emit({ type: 'status', agentId: id, status: 'completed', at: Date.now() })
      return this.get(id)!
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      managed.view.status = 'error'
      this.emit({ type: 'status', agentId: id, status: 'error', at: Date.now() })
      this.emit({ type: 'error', agentId: id, message, at: Date.now() })
      this.pushMessage(id, { kind: 'error', content: message, at: Date.now() })
      throw err
    } finally {
      managed.running = false
    }
  }

  private async executeCycle(managed: ManagedAgent): Promise<string> {
    const { template, symbols } = managed
    if (managed.agent) {
      return managed.agent.run(template.buildPrompt(symbols))
    }
    // Rule mode: deterministic analysis from live multi-source prices.
    const parts: string[] = []
    for (const symbol of symbols) {
      let ticks = new Map<string, TickData>()
      try {
        ticks = await this.market.getTicksAll(symbol)
      } catch {
        ticks = new Map()
      }
      const analysis: StockAnalysis = analyzeStock(symbol, ticks)
      parts.push(formatAnalysis(analysis))
    }
    return parts.join('\n\n')
  }

  stop(id: string): void {
    const managed = this.agents.get(id)
    if (!managed) return
    if (managed.timer) {
      clearInterval(managed.timer)
      managed.timer = null
    }
    managed.agent?.cancel()
    managed.view.status = 'stopped'
    this.emit({ type: 'status', agentId: id, status: 'stopped', at: Date.now() })
    this.persist(id)
  }

  remove(id: string): void {
    this.stop(id)
    this.agents.delete(id)
    this.removePersisted(id)
  }

  get(id: string): AgentInstanceView | null {
    return this.agents.get(id)?.view ?? null
  }

  list(): AgentInstanceView[] {
    return Array.from(this.agents.values()).map((m) => m.view)
  }

  /** Set the polling interval of an existing agent. */
  setIntervalMs(id: string, intervalMs: number): void {
    const managed = this.agents.get(id)
    if (!managed) return
    managed.template = { ...managed.template, defaultIntervalMs: intervalMs }
    managed.view.intervalMs = intervalMs
    if (managed.timer) {
      clearInterval(managed.timer)
      managed.timer = setInterval(() => void this.runOnce(id), intervalMs)
    }
    this.persist(id)
  }

  // --- Events ---

  onEvent(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(event: AgentManagerEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event)
      } catch {
        // subscriber errors must not break the manager
      }
    }
  }

  private pushMessage(agentId: string, msg: Omit<AgentMessageView, 'id' | 'at'> & { at?: number }): void {
    const managed = this.agents.get(agentId)
    if (!managed) return
    const entry: AgentMessageView = {
      id: generateId('msg_'),
      at: msg.at ?? Date.now(),
      kind: msg.kind,
      content: msg.content,
      role: msg.role,
    }
    managed.view.messages.push(entry)
    if (managed.view.messages.length > MAX_MESSAGES) {
      managed.view.messages.splice(0, managed.view.messages.length - MAX_MESSAGES)
    }
    this.persist(agentId)
    if (msg.kind === 'step') {
      this.emit({ type: 'step', agentId, content: msg.content, at: entry.at })
    } else if (msg.kind === 'error') {
      this.emit({ type: 'error', agentId, message: msg.content, at: entry.at })
    } else {
      this.emit({ type: 'message', agentId, content: msg.content, at: entry.at })
    }
  }
}

/** Market source wrapper that only exposes authorized providers. */
class ScopedMarket implements MarketToolsSource {
  constructor(
    private inner: MarketDataAggregator,
    private sources: string[],
  ) {}

  private allowed(providerId?: string): boolean {
    if (this.sources.length === 0) return true
    return providerId ? this.sources.includes(providerId) : true
  }

  async getTick(symbol: string, providerId?: string): Promise<TickData> {
    if (!this.allowed(providerId)) {
      throw new Error(`Data source '${providerId}' is not authorized for this agent`)
    }
    return this.inner.getTick(symbol, providerId)
  }

  async getTicksAll(symbol: string): Promise<Map<string, TickData>> {
    const providers = this.inner.listProviders().filter((p) => this.allowed(p.id))
    const out = new Map<string, TickData>()
    await Promise.all(
      providers.map(async (provider) => {
        try {
          const tick = await provider.getTick(symbol)
          out.set(provider.id, tick)
        } catch {
          // skip unavailable sources
        }
      }),
    )
    return out
  }

  async getCandles(
    symbol: string,
    timeframe: string,
    options?: { limit?: number },
  ): Promise<CandleData[]> {
    return this.inner.getCandles(symbol, timeframe as never, options)
  }

  async getOrderBook(
    symbol: string,
    limit?: number,
    providerId?: string,
  ): Promise<OrderBookData> {
    if (!this.allowed(providerId)) {
      throw new Error(`Data source '${providerId}' is not authorized for this agent`)
    }
    return this.inner.getOrderBook(symbol, limit, providerId)
  }
}

/** Wallet read access wrapper that only exposes authorized wallet keys. */
class ScopedWalletAccess implements WalletReadAccess {
  constructor(
    private inner: WalletReadAccess,
    private keys: string[],
  ) {}

  listAuthorizedWallets(): { id: string; address: string; name: string }[] {
    if (this.keys.length === 0) return []
    const byKey = new Map(this.inner.listAuthorizedWallets().map((w) => [w.id, w]))
    return this.keys
      .map((k) => byKey.get(k))
      .filter((w): w is { id: string; address: string; name: string } => w !== undefined)
  }
}

/** Format a rule-mode analysis as readable text. */
function formatAnalysis(a: StockAnalysis): string {
  const lines = [
    `${a.symbol}: ${a.action} (confidence ${Math.round(a.confidence * 100)}%)`,
    a.summary,
    'Reasons:',
    ...a.reasons.map((r) => `  - ${r}`),
  ]
  if (a.risks.length > 0) {
    lines.push('Risks:')
    lines.push(...a.risks.map((r) => `  - ${r}`))
  }
  return lines.join('\n')
}
