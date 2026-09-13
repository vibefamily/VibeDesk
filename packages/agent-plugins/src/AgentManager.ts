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
import { PiAgent } from './runtime/PiAgent'
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
import { createTradeTools, type TradeExecutor } from './tools/tradeTools'
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
  /** Streamed reasoning text (pi thinking_delta), shown above the reply. */
  thinking?: string
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
  /** Latest structured analysis (rule mode) - the "signal" for the
   *  Agent Trade Run closed loop. Null until the first rule run. */
  lastAnalysis: StockAnalysis | null
  /** Recent output lines (capped) */
  messages: AgentMessageView[]
  /** Data source ids this agent may query (empty = all registered). */
  dataSources: string[]
  /** Authorized wallet keys this agent may read (walletId:index, empty = none). */
  walletAuths: string[]
  /** Enabled skill ids for this agent (e.g. 'trade-execute'). */
  skills: string[]
  /** Whether a desktop shortcut should be shown on the VibeDesk home desktop. */
  desktopIcon: boolean
  /**
   * pi session JSONL file (M7-3): persisted so the same pi conversation
   * resumes across restarts. Null until the first pi run completes.
   */
  piSessionFile?: string | null
  /** Agent-specific model override (falls back to the active provider's default). */
  model?: string | null
}

/** One configured LLM provider (OpenAI-compatible, Anthropic or Gemini). */
export interface LlmProviderConfig {
  id: string
  name: string
  /** pi api adapter: openai-completions (also Ollama), anthropic-messages, google-generative-ai */
  api: 'openai-completions' | 'anthropic-messages' | 'google-generative-ai'
  baseUrl: string
  apiKey: string
  /** Models this provider offers (agent may pick any of these). */
  models: string[]
  /** Provider-default model (active provider's default). */
  model: string
  active: boolean
}

/** Persisted LLM settings file: a list of providers, one active. */
export type LlmConfigFile = {
  providers: LlmProviderConfig[]
}

/** Events emitted by the AgentManager. */
export type AgentManagerEvent =
  | { type: 'status'; agentId: string; status: AgentViewStatus; at: number }
  | { type: 'step'; agentId: string; content: string; at: number }
  | { type: 'message'; agentId: string; content: string; at: number }
  | { type: 'error'; agentId: string; message: string; at: number }
  | { type: 'analysis'; agentId: string; analysis: StockAnalysis; at: number }
  | { type: 'stream'; agentId: string; messageId: string; content: string; at: number }
  | { type: 'thinking'; agentId: string; messageId: string; content: string; at: number }

type Listener = (event: AgentManagerEvent) => void

interface ManagedAgent {
  template: AgentTemplate
  view: AgentInstanceView
  agent: Agent | PiAgent | null
  timer: ReturnType<typeof setInterval> | null
  symbols: string[]
  running: boolean
  /** Id of the assistant message currently being streamed (null when idle). */
  streamMsgId: string | null
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
  /** Directory for the pi agent harness (settings + session artifacts).
   *  Isolated under userData so pi never touches ~/.pi or the repo. */
  piAgentDir?: string
  /**
   * Enabled tool-set skill ids ('market' | 'wallet-read' | 'info' |
   * 'trade-execute'). Controls which VibeDesk tools become pi
   * customTools. When omitted, every built-in tool-set is enabled
   * (backward compatible).
   */
  enabledToolsets?: string[]
  /** Bridge for the trade-execute skill (real Arc swaps). Optional. */
  tradeExecutor?: TradeExecutor
}

export class AgentManager {
  private templates = new Map<string, AgentTemplate>()
  private agents = new Map<string, ManagedAgent>()
  private listeners = new Set<Listener>()
  private market: MarketDataAggregator
  private walletAccess?: WalletReadAccess
  private infoStore?: InfoStore
  private providers: LlmProviderConfig[] = []
  private llmProvider: OpenAICompatibleProvider | null = null
  private storage: AgentStorage | null = null
  private saveTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private piAgentDir?: string
  private enabledToolsets?: string[]
  private tradeExecutor?: TradeExecutor

  constructor(options: AgentManagerOptions) {
    this.market = options.market
    this.walletAccess = options.walletAccess
    this.infoStore = options.infoStore
    this.piAgentDir = options.piAgentDir
    this.enabledToolsets = options.enabledToolsets
    this.tradeExecutor = options.tradeExecutor
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

  // --- LLM configuration (multi-provider, one active) ---

  /** Replace the whole provider list (used at startup from the config file). */
  setProviders(file: LlmConfigFile | null): void {
    this.providers = []
    this.llmProvider = null
    if (!file || !Array.isArray(file.providers)) return
    for (const p of file.providers) {
      if (!p.id || !p.baseUrl || !p.apiKey || !p.model) continue
      this.providers.push({
        id: p.id,
        name: p.name || p.id,
        api: p.api ?? 'openai-completions',
        baseUrl: p.baseUrl,
        apiKey: p.apiKey,
        models: Array.isArray(p.models) && p.models.length > 0 ? p.models : [p.model],
        model: p.model,
        active: p.active === true,
      })
    }
    if (this.providers.length === 0) return
    const active = this.providers.find((p) => p.active) ?? this.providers[0]!
    active.active = true
    this.syncProvider()
  }

  /** All providers (full configs; the IPC layer masks keys for the renderer). */
  listProviders(): LlmProviderConfig[] {
    return this.providers.map((p) => ({ ...p }))
  }

  /** Add or update one provider. Empty apiKey keeps the stored key. */
  saveProvider(input: {
    id?: string
    name: string
    api: LlmProviderConfig['api']
    baseUrl: string
    apiKey?: string
    models: string[]
    model: string
    active?: boolean
  }): LlmProviderConfig {
    if (!input.baseUrl.trim()) throw new Error('Base URL is required')
    const id = input.id ?? `prov_${Date.now().toString(36)}`
    const models = input.models.length > 0 ? input.models : [input.model]
    const existing = this.providers.find((p) => p.id === id)
    const merged: LlmProviderConfig = {
      id,
      name: input.name.trim() || id,
      api: input.api,
      baseUrl: input.baseUrl.trim(),
      apiKey: input.apiKey && input.apiKey.trim() ? input.apiKey.trim() : (existing?.apiKey ?? ''),
      models,
      model: input.model.trim() || models[0]!,
      active: input.active === true,
    }
    if (!merged.apiKey) throw new Error('API key is required')
    if (existing) {
      const idx = this.providers.indexOf(existing)
      this.providers[idx] = merged
    } else {
      if (this.providers.length === 0) merged.active = true
      this.providers.push(merged)
    }
    if (merged.active) this.syncProvider()
    return { ...merged }
  }

  /** Activate one provider (only one active at a time). */
  activateProvider(id: string): void {
    if (!this.providers.some((p) => p.id === id)) throw new Error(`Unknown provider: ${id}`)
    for (const p of this.providers) p.active = p.id === id
    this.syncProvider()
  }

  /** Remove a provider; if it was active, the first remaining becomes active. */
  removeProvider(id: string): void {
    const wasActive = this.providers.find((p) => p.id === id)?.active === true
    this.providers = this.providers.filter((p) => p.id !== id)
    if (wasActive && this.providers.length > 0) this.providers[0]!.active = true
    this.syncProvider()
  }

  /** Rebuild the runtime provider from the active config. */
  private syncProvider(): void {
    const active = this.providers.find((p) => p.active)
    if (!active) {
      this.llmProvider = null
      return
    }
    const cfg = { baseUrl: active.baseUrl, apiKey: active.apiKey, model: active.model }
    if (this.llmProvider) this.llmProvider.updateConfig(cfg)
    else this.llmProvider = new OpenAICompatibleProvider(cfg)
  }

  /** Change the active provider's default model (used by legacy callers). */
  setActiveModel(model: string): void {
    const active = this.providers.find((p) => p.active)
    if (!active) throw new Error('No LLM configured')
    active.model = model.trim() || active.model
    if (!active.models.includes(active.model)) active.models.push(active.model)
    this.syncProvider()
  }

  /** Legacy single-config entry point (compat with old callers/tests). */
  setLlmConfig(config: OpenAIConfig | null): void {
    if (!config || !config.apiKey || !config.baseUrl) {
      this.providers = []
      this.llmProvider = null
      return
    }
    this.providers = [
      {
        id: 'default',
        name: 'Default',
        api: 'openai-completions',
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        models: [config.model],
        model: config.model,
        active: true,
      },
    ]
    this.syncProvider()
  }

  /** Agent-specific model override for one agent (falls back to the active provider's default). */
  setAgentModel(id: string, model: string): void {
    const managed = this.agents.get(id)
    if (!managed) throw new Error(`Unknown agent: ${id}`)
    managed.view.model = model.trim() || null
    if (this.llmProvider) managed.agent = this.buildAgent(managed)
    this.persist(id)
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
            lastAnalysis: view.lastAnalysis ?? null,
            messages: Array.isArray(view.messages)
              ? view.messages.slice(-MAX_MESSAGES)
              : [],
            dataSources: Array.isArray(view.dataSources) ? view.dataSources : [],
            walletAuths: Array.isArray(view.walletAuths) ? view.walletAuths : [],
            skills: Array.isArray(view.skills) ? view.skills : [],
            desktopIcon: view.desktopIcon === true,
          },
          agent: null,
          timer: null,
          symbols: Array.isArray(view.symbols) ? view.symbols : [...template.defaultSymbols],
          running: false,
          streamMsgId: null,
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
      skills?: string[]
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
      lastAnalysis: null,
      messages: [],
      dataSources: options.dataSources ?? [],
      walletAuths: options.walletAuths ?? [],
      skills: options.skills ?? [],
      desktopIcon: options.desktopIcon ?? false,
    }

    const managed: ManagedAgent = {
      template,
      view,
      agent: null,
      timer: null,
      symbols,
      running: false,
      streamMsgId: null,
    }

    // Build the ReAct agent when LLM mode is available.
    if (this.llmProvider) {
      managed.agent = this.buildAgent(managed)
    }

    this.agents.set(id, managed)
    this.persist(id)
    return view
  }

  /**
   * Show or hide an agent's shortcut on the VibeDesk home desktop
   * (used by the desktop seeder to keep Trade Agent / Chat Agent pinned).
   */
  setDesktopIcon(id: string, desktopIcon: boolean): AgentInstanceView {
    const inst = this.agents.get(id)
    if (!inst) {
      throw new Error(`Unknown agent: ${id}`)
    }
    inst.view = { ...inst.view, desktopIcon }
    this.persist(id)
    return inst.view
  }

  private buildAgent(managed: ManagedAgent): Agent | PiAgent {
    const { template, view } = managed
    const activeProvider = this.providers.find((p) => p.active)
    const config: AgentConfig = template.buildConfig(
      view.id,
      view.name,
      view.model ?? this.llmProvider!.getConfig().model,
    )
    const enabled = new Set([
      ...(this.enabledToolsets ?? ['market', 'wallet-read', 'info']),
      ...(view.skills ?? []),
    ])
    const tools = [
      ...(enabled.has('market')
        ? createMarketTools(new ScopedMarket(this.market, view.dataSources))
        : []),
      ...(enabled.has('wallet-read') && this.walletAccess
        ? [createWalletReadTool(new ScopedWalletAccess(this.walletAccess, view.walletAuths))]
        : []),
      ...(enabled.has('info') && this.infoStore
        ? [createInfoReadTool(this.infoStore)]
        : []),
      ...(enabled.has('info') ? [createNewsTool()] : []),
      ...(enabled.has('trade-execute') && this.tradeExecutor
        ? createTradeTools(this.tradeExecutor)
        : []),
    ]
    // LLM path runs on the pi agent harness (openclaw's engine): persistent
    // AgentSession, professional tool calling, skills-ready. The legacy ReAct
    // Agent stays in the repo as a reference, but is no longer constructed.
    const piAgent = new PiAgent({
      agentId: view.id,
      agentName: view.name,
      api: activeProvider?.api ?? 'openai-completions',
      baseUrl: this.llmProvider!.getConfig().baseUrl,
      apiKey: this.llmProvider!.getConfig().apiKey,
      model: view.model ?? this.llmProvider!.getConfig().model,
      systemPrompt: config.systemPrompt,
      tools,
      piAgentDir: this.piAgentDir ?? process.cwd(),
      sessionFile: view.piSessionFile ?? null,
    })
    piAgent.onEvent((event) => {
      if (event.type === 'step') {
        const step = event.data as { type: string; content: string; timestamp: number }
        this.pushMessage(view.id, { kind: 'step', content: step.content, at: step.timestamp })
      } else if (event.type === 'assistant_start') {
        // Begin a reply bubble; stream_delta / thinking_delta append to it.
        this.pushMessage(view.id, { kind: 'message', role: 'agent', content: '' })
        const msgs = managed.view.messages
        managed.streamMsgId = msgs[msgs.length - 1]?.id ?? null
      } else if (event.type === 'stream_delta') {
        const delta = String(event.data)
        if (managed.streamMsgId) {
          const msgs = managed.view.messages
          const idx = msgs.findIndex((m) => m.id === managed.streamMsgId)
          if (idx >= 0) {
            const content = msgs[idx]!.content + delta
            msgs[idx] = { ...msgs[idx]!, content }
            this.persist(view.id)
            this.emit({ type: 'stream', agentId: view.id, messageId: managed.streamMsgId, content, at: Date.now() })
          }
        }
      } else if (event.type === 'thinking_delta') {
        const delta = String(event.data)
        if (managed.streamMsgId) {
          const msgs = managed.view.messages
          const idx = msgs.findIndex((m) => m.id === managed.streamMsgId)
          if (idx >= 0) {
            const thinking = (msgs[idx]!.thinking ?? '') + delta
            msgs[idx] = { ...msgs[idx]!, thinking }
            this.persist(view.id)
            this.emit({ type: 'thinking', agentId: view.id, messageId: managed.streamMsgId, content: thinking, at: Date.now() })
          }
        }
      } else if (event.type === 'final_message') {
        const text = String(event.data)
        if (managed.streamMsgId) {
          const msgs = managed.view.messages
          const idx = msgs.findIndex((m) => m.id === managed.streamMsgId)
          if (idx >= 0) {
            msgs[idx] = { ...msgs[idx]!, content: text }
            this.persist(view.id)
            this.emit({ type: 'stream', agentId: view.id, messageId: managed.streamMsgId, content: text, at: Date.now() })
          }
        } else {
          this.pushMessage(view.id, { kind: 'message', content: text, at: Date.now() })
        }
        managed.streamMsgId = null
      } else if (event.type === 'error') {
        this.emit({ type: 'error', agentId: view.id, message: String(event.data), at: Date.now() })
      }
    })
    return piAgent
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

  /** Enable/disable skills for an agent (e.g. 'trade-execute'). */
  setSkills(id: string, skills: string[]): void {
    const managed = this.agents.get(id)
    if (!managed) return
    managed.view.skills = [...new Set(skills)]
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

  /**
   * Persist the pi session file pointer after a run so the same
   * conversation resumes across restarts (M7-3).
   */
  private syncPiSessionFile(managed: ManagedAgent, id: string): void {
    const agent = managed.agent
    if (agent instanceof PiAgent) {
      const sessionFile = agent.getSessionFile()
      if (sessionFile && managed.view.piSessionFile !== sessionFile) {
        managed.view.piSessionFile = sessionFile
        this.persist(id)
      }
    }
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
      this.syncPiSessionFile(managed, id)
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
    managed.streamMsgId = null
    managed.view.status = 'running'
    this.emit({ type: 'status', agentId: id, status: 'running', at: Date.now() })
    this.pushMessage(id, { kind: 'message', role: 'user', content: text, at: Date.now() })
    try {
      const output = await managed.agent.run(text)
      managed.view.lastMessage = output
      managed.view.status = 'completed'
      this.emit({ type: 'status', agentId: id, status: 'completed', at: Date.now() })
      this.syncPiSessionFile(managed, id)
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
      managed.streamMsgId = null
    }
  }

  private async executeCycle(managed: ManagedAgent): Promise<string> {
    const { template, symbols } = managed
    let output: string
    if (managed.agent) {
      output = await managed.agent.run(template.buildPrompt(symbols))
    } else {
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
        // Emit the structured signal so the renderer can power the
        // Agent Trade Run closed loop (signal -> intent -> execution).
        managed.view.lastAnalysis = analysis
        this.emit({ type: 'analysis', agentId: managed.view.id, analysis, at: Date.now() })
        parts.push(formatAnalysis(analysis))
      }
      return parts.join('\n\n')
    }
    // LLM mode: the pi agent produced a text recommendation. Emit the same
    // structured analysis signal (computed from live prices) so the Trade
    // Run pipeline has a signal card regardless of execution mode.
    for (const symbol of symbols) {
      let ticks = new Map<string, TickData>()
      try {
        ticks = await this.market.getTicksAll(symbol)
      } catch {
        ticks = new Map()
      }
      const analysis: StockAnalysis = analyzeStock(symbol, ticks)
      managed.view.lastAnalysis = analysis
      this.emit({ type: 'analysis', agentId: managed.view.id, analysis, at: Date.now() })
    }
    return output
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
    const managed = this.agents.get(id)
    if (managed?.agent instanceof PiAgent) managed.agent.dispose()
    this.agents.delete(id)
    this.removePersisted(id)
  }

  /**
   * Clear a chat session: wipe the visible message history and reset the
   * pi session (if any) so the next run starts with fresh context.
   */
  clearChat(id: string): AgentInstanceView {
    const managed = this.agents.get(id)
    if (!managed) {
      throw new Error(`Unknown agent: ${id}`)
    }
    managed.view.messages = []
    managed.view.lastMessage = null
    managed.agent?.reset()
    this.persist(id)
    return managed.view
  }

  get(id: string): AgentInstanceView | null {
    return this.agents.get(id)?.view ?? null
  }

  list(): AgentInstanceView[] {
    return Array.from(this.agents.values()).map((m) => m.view)
  }

  /** Set the polling interval (ms) of an existing agent. 0 disables polling. */
  setIntervalMs(id: string, intervalMs: number): void {
    const managed = this.agents.get(id)
    if (!managed) return
    const ms = Math.max(0, Math.floor(intervalMs))
    managed.template = { ...managed.template, defaultIntervalMs: ms }
    managed.view.intervalMs = ms
    if (managed.timer) {
      clearInterval(managed.timer)
      managed.timer = null
    }
    if (ms > 0 && managed.running) {
      managed.timer = setInterval(() => void this.runOnce(id), ms)
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
