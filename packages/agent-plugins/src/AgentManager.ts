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
import type { TickData } from '@vibe/shared'
import { Agent } from './runtime/Agent'
import type { AgentConfig, LLMProvider } from './runtime/types'
import type { AgentTemplate } from './templates'
import { BUILTIN_TEMPLATES } from './templates'
import { OpenAICompatibleProvider } from './llm/OpenAICompatibleProvider'
import type { OpenAIConfig } from './llm/OpenAICompatibleProvider'
import { createMarketTools } from './tools/marketTools'
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

const MAX_MESSAGES = 60

export interface AgentManagerOptions {
  /** Aggregator with live data sources (used by market tools + rule mode). */
  market: MarketDataAggregator
  /** Read-only wallet access (authorized wallets only). */
  walletAccess?: WalletReadAccess
  /** Local information store (Info Center cache); enables read_information. */
  infoStore?: InfoStore
}

export class AgentManager {
  private templates = new Map<string, AgentTemplate>()
  private agents = new Map<string, ManagedAgent>()
  private listeners = new Set<Listener>()
  private market: MarketDataAggregator
  private walletAccess?: WalletReadAccess
  private infoStore?: InfoStore
  private llmProvider: OpenAICompatibleProvider | null = null

  constructor(options: AgentManagerOptions) {
    this.market = options.market
    this.walletAccess = options.walletAccess
    this.infoStore = options.infoStore
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

  // --- Instance lifecycle ---

  create(
    templateId: string,
    options: { name?: string; symbols?: string[] } = {},
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
    return view
  }

  private buildAgent(managed: ManagedAgent): Agent {
    const { template, view } = managed
    const config: AgentConfig = template.buildConfig(view.id, view.name, this.llmProvider!.getConfig().model)
    const agent = new Agent(config, this.llmProvider!)
    const tools = [
      ...createMarketTools(this.market),
      ...(this.walletAccess ? [createWalletReadTool(this.walletAccess)] : []),
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

  start(id: string): void {
    const managed = this.agents.get(id)
    if (!managed) throw new Error(`Unknown agent: ${id}`)
    if (managed.timer) return

    void this.runOnce(id)
    managed.timer = setInterval(() => {
      void this.runOnce(id)
    }, managed.template.defaultIntervalMs)
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
  }

  remove(id: string): void {
    this.stop(id)
    this.agents.delete(id)
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
    }
    managed.view.messages.push(entry)
    if (managed.view.messages.length > MAX_MESSAGES) {
      managed.view.messages.splice(0, managed.view.messages.length - MAX_MESSAGES)
    }
    if (msg.kind === 'step') {
      this.emit({ type: 'step', agentId, content: msg.content, at: entry.at })
    } else if (msg.kind === 'error') {
      this.emit({ type: 'error', agentId, message: msg.content, at: entry.at })
    } else {
      this.emit({ type: 'message', agentId, content: msg.content, at: entry.at })
    }
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
