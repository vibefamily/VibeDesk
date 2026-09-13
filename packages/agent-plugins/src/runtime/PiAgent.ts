/**
 * PiAgent - VibeDesk's adapter over the @earendil-works/pi agent harness
 * (the same engine openclaw embeds).
 *
 * Implements the same surface as the legacy ReAct Agent (run / onEvent /
 * getMessages / getStatus / dispose) so AgentManager can swap runtimes
 * without touching call sites. The pi AgentSession is created lazily on the
 * first run() and reused across turns, giving each agent persistent context
 * with professional harness features (compaction, skills, multi-provider).
 *
 * Provider config comes from the user's existing VibeDesk LLM settings
 * (OpenAI-compatible / Ollama), registered into pi's ModelRuntime.
 */

import { ModelRuntime, createAgentSession, DefaultResourceLoader } from '@earendil-works/pi-coding-agent'
import type { AgentEvent } from '@earendil-works/pi-agent-core'
import { randomUUID } from 'node:crypto'
import type {
  AgentEventType,
  AgentRunStatus,
  ChatMessage,
  ToolDefinition,
} from './types'
import { toPiToolDefinition } from './piTools'

type EventCallback = (event: { type: AgentEventType; data: unknown }) => void

export interface PiAgentOptions {
  /** Agent id (used for tool context + session isolation). */
  agentId: string
  /** Agent display name. */
  agentName: string
  /** OpenAI-compatible base URL (OpenAI / DeepSeek / Ollama / ...). */
  baseUrl: string
  /** API key (may be empty for local providers like Ollama). */
  apiKey: string
  /** Model id. */
  model: string
  /** System prompt (agent template + project instructions). */
  systemPrompt: string
  /** VibeDesk tools to expose to the pi session. */
  tools: ToolDefinition[]
  /** Working directory + pi settings dir (isolated under userData). */
  piAgentDir: string
}

interface SessionLike {
  agent: {
    subscribe(listener: (event: AgentEvent, signal: AbortSignal) => void): () => void
    prompt(text: string): Promise<void>
    waitForIdle(): Promise<void>
    abort(): void
    reset(): void
  }
}

export class PiAgent {
  readonly config: PiAgentOptions
  private session: SessionLike | null = null
  private unsub: (() => void) | null = null
  private listeners = new Set<EventCallback>()
  private messages: ChatMessage[] = []
  private status: AgentRunStatus = 'idle'
  private initError: string | null = null
  private lastStreamed: string[] = []

  constructor(config: PiAgentOptions) {
    this.config = config
  }

  /** Register a tool (compat with legacy Agent surface). */
  registerTool(tool: ToolDefinition): void {
    this.config.tools.push(tool)
    // Session already built: rebuild is required to pick the tool up.
    // AgentManager always builds tools before first run(), so this is a no-op
    // in practice; keep for interface compatibility.
  }

  registerTools(tools: ToolDefinition[]): void {
    for (const tool of tools) this.registerTool(tool)
  }

  getAvailableTools(): ToolDefinition[] {
    return [...this.config.tools]
  }

  getMessages(): ChatMessage[] {
    return [...this.messages]
  }

  getStatus(): AgentRunStatus {
    return this.status
  }

  onEvent(callback: EventCallback): void {
    this.listeners.add(callback)
  }

  private emit(event: { type: AgentEventType; data: unknown }): void {
    for (const cb of this.listeners) cb(event)
  }

  /** Lazily build the pi ModelRuntime + AgentSession on first run. */
  private async ensureSession(): Promise<void> {
    if (this.session) return
    if (this.initError) throw new Error(this.initError)

    const { baseUrl, apiKey, model, agentId, agentName, systemPrompt, piAgentDir } = this.config
    try {
      const modelRuntime = await ModelRuntime.create({
        allowModelNetwork: false,
        refreshOnCreate: false,
      })
      const providerId = `vibedesk-${agentId}`
      modelRuntime.registerProvider(providerId, {
        name: agentName,
        baseUrl,
        ...(apiKey ? { apiKey } : {}),
        api: 'openai-completions',
        models: [
          {
            id: model,
            name: model,
            reasoning: false,
            input: ['text'],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: 65536,
            maxTokens: 4096,
            compat: { supportsDeveloperRole: false },
          },
        ],
      })
      const piModel = modelRuntime.getModel(providerId, model)
      if (!piModel) throw new Error(`pi model registration failed for ${model}`)

      const toolCtx = {
        agentId,
        conversationId: randomUUID(),
      }
      const customTools = this.config.tools.map((t) => toPiToolDefinition(t, toolCtx))

      // Isolated resource loader: empty pi dir, our system prompt, no
      // extensions/skills/themes so pi never reads user or repo config.
      const resourceLoader = new DefaultResourceLoader({
        cwd: piAgentDir,
        agentDir: piAgentDir,
        systemPrompt,
        noExtensions: true,
        noThemes: true,
        noPromptTemplates: true,
      })
      await resourceLoader.reload()

      const created = await createAgentSession({
        cwd: piAgentDir,
        agentDir: piAgentDir,
        modelRuntime,
        model: piModel,
        thinkingLevel: 'off',
        noTools: 'builtin',
        customTools: customTools as never,
        resourceLoader,
      })
      this.session = created.session as unknown as SessionLike
      this.unsub = this.session.agent.subscribe((event) => this.handlePiEvent(event))
      this.emit({ type: 'step', data: { type: 'info', content: 'pi runtime ready', timestamp: Date.now() } })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.initError = message
      this.emit({ type: 'error', data: message })
      throw err
    }
  }

  /** Translate pi agent events into the VibeDesk event protocol. */
  private handlePiEvent(event: AgentEvent): void {
    if (!event) return
    switch (event.type) {
      case 'message_end': {
        const msg = event.message as unknown as {
          content?: Array<{ type?: string; text?: string }>
        }
        const text = (msg?.content ?? [])
          .filter((b) => b.type === 'text')
          .map((b) => b.text ?? '')
          .join('\n')
          .trim()
        if (text) {
          this.lastStreamed.push(text)
          this.messages.push({ role: 'assistant', content: text })
          this.emit({ type: 'final_message', data: text })
        }
        break
      }
      case 'tool_execution_start': {
        const name = (event as { toolName?: string }).toolName
        if (name) this.emit({ type: 'step', data: { type: 'tool', content: `calling ${name}...`, timestamp: Date.now() } })
        break
      }
      default:
        break
    }
  }

  /**
   * Run one turn: prompt the pi agent, wait for idle, return the final text.
   * Mirrors the legacy Agent.run() contract.
   */
  async run(userMessage: string): Promise<string> {
    this.status = 'running'
    this.emit({ type: 'status_change', data: 'running' })
    this.messages.push({ role: 'user', content: userMessage })
    try {
      await this.ensureSession()
      this.lastStreamed = []
      const session = this.session!
      await session.agent.prompt(userMessage)
      await session.agent.waitForIdle()
      const output = this.lastStreamed.join('\n\n') || '(no text response)'
      this.messages.push({ role: 'assistant', content: output })
      this.status = 'completed'
      this.emit({ type: 'status_change', data: 'completed' })
      return output
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.messages.push({ role: 'assistant', content: `error: ${message}` })
      this.status = 'error'
      this.emit({ type: 'status_change', data: 'error' })
      this.emit({ type: 'error', data: message })
      throw err
    }
  }

  /** Reset the underlying pi session (fresh context). */
  reset(): void {
    this.session?.agent.reset()
    this.messages = []
    this.lastStreamed = []
    this.status = 'idle'
  }

  /** Abort any in-flight pi turn. */
  abort(): void {
    this.session?.agent.abort()
  }

  /** Alias used by AgentManager teardown paths. */
  cancel(): void {
    this.abort()
  }

  /** Tear down the pi session and listeners. */
  dispose(): void {
    this.unsub?.()
    this.unsub = null
    this.session?.agent.abort()
    this.session = null
    this.listeners.clear()
  }
}
