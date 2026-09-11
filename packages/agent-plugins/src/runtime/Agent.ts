/**
 * Agent runtime - core agent loop with tool calling.
 *
 * Implements a ReAct-style agent loop:
 * 1. Send messages to LLM
 * 2. If LLM returns tool calls, execute them
 * 3. Append tool results to conversation
 * 4. Repeat until LLM returns a final answer or max iterations reached
 *
 * Supports human-in-the-loop: the agent can pause for approval before
 * executing high-risk tool calls (like placing orders).
 */

import { generateId } from '@vibe/shared/utils'
import type {
  AgentConfig,
  AgentEventType,
  AgentRunStatus,
  AgentStep,
  ApprovalRequest,
  ChatMessage,
  LLMProvider,
  ToolCall,
  ToolContext,
  ToolDefinition,
  ToolResult,
} from './types'

type EventCallback = (event: { type: AgentEventType; data: unknown }) => void

/**
 * Agent - the core AI agent runtime.
 *
 * Manages a conversation, executes tool calls, and streams updates
 * via event callbacks. Designed to work with any LLM provider that
 * supports tool calling.
 */
export class Agent {
  readonly config: AgentConfig
  private provider: LLMProvider
  private tools: Map<string, ToolDefinition> = new Map()
  private messages: ChatMessage[] = []
  private status: AgentRunStatus = 'idle'
  private listeners = new Set<EventCallback>()
  private pendingApproval: ApprovalRequest | null = null
  private abortController: AbortController | null = null

  constructor(config: AgentConfig, provider: LLMProvider) {
    this.config = config
    this.provider = provider
  }

  /** Register a tool that this agent can use */
  registerTool(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool)
  }

  /** Register multiple tools */
  registerTools(tools: ToolDefinition[]): void {
    for (const tool of tools) {
      this.registerTool(tool)
    }
  }

  /** Get available tool definitions */
  getAvailableTools(): ToolDefinition[] {
    return this.config.tools
      .map((name) => this.tools.get(name))
      .filter((t): t is ToolDefinition => t !== undefined)
  }

  /** Get current conversation messages */
  getMessages(): ChatMessage[] {
    return [...this.messages]
  }

  /** Get current run status */
  getStatus(): AgentRunStatus {
    return this.status
  }

  /** Subscribe to agent events */
  onEvent(callback: EventCallback): () => void {
    this.listeners.add(callback)
    return () => this.listeners.delete(callback)
  }

  /**
   * Send a user message and run the agent loop.
   * Returns the final assistant message.
   */
  async run(userMessage: string): Promise<string> {
    this.abortController = new AbortController()
    this.setStatus('running')
    this.pendingApproval = null

    // Add user message
    this.messages.push({ role: 'user', content: userMessage })
    this.emit({ type: 'step', data: {
      type: 'message',
      content: userMessage,
      timestamp: Date.now(),
    } as AgentStep })

    let iterations = 0
    const maxIterations = this.config.maxIterations

    try {
      while (iterations < maxIterations) {
        iterations++

        // Call LLM
        const assistantMsg = await this.provider.chatComplete({
          messages: this.buildMessagesWithSystemPrompt(),
          tools: this.getAvailableTools(),
          model: this.config.model,
          temperature: this.config.temperature,
          signal: this.abortController.signal,
        })

        this.messages.push(assistantMsg)

        // If no tool calls, we're done
        if (!assistantMsg.toolCalls || assistantMsg.toolCalls.length === 0) {
          this.emit({ type: 'step', data: {
            type: 'message',
            content: assistantMsg.content,
            timestamp: Date.now(),
          } as AgentStep })
          this.setStatus('completed')
          this.emit({ type: 'final_message', data: assistantMsg.content })
          return assistantMsg.content
        }

        // Check if any tool calls require human approval
        const riskyCalls = assistantMsg.toolCalls.filter((tc) =>
          this.isHighRiskTool(tc.name),
        )

        if (riskyCalls.length > 0) {
          const approval: ApprovalRequest = {
            id: generateId('apr_'),
            agentId: this.config.id,
            conversationId: 'default',
            action: `Execute ${riskyCalls.length} trade action(s)`,
            reasoning: assistantMsg.content,
            confidence: 0.8,
            toolCalls: riskyCalls,
            riskWarnings: ['This action involves real trading', 'Double-check before approving'],
            timestamp: Date.now(),
          }
          this.pendingApproval = approval
          this.setStatus('awaiting_approval')
          this.emit({ type: 'approval_request', data: approval })

          // Pause - wait for approve/reject call
          return new Promise((resolve, reject) => {
            const originalApprove = this.approve.bind(this)
            const originalReject = this.reject.bind(this)

            this.approve = async () => {
              this.approve = originalApprove
              this.pendingApproval = null
              this.setStatus('running')
              await this.executeToolCalls(assistantMsg.toolCalls!)
              // Continue loop by recursing
              const result = await this.continueLoop(maxIterations - iterations)
              resolve(result)
            }

            this.reject = async (reason?: string) => {
              this.reject = originalReject
              this.pendingApproval = null
              this.setStatus('completed')
              const msg = `Action rejected. ${reason ? `Reason: ${reason}` : ''}`
              this.messages.push({ role: 'user', content: msg })
              this.emit({ type: 'final_message', data: msg })
              resolve(msg)
            }
          })
        }

        // Execute all tool calls
        await this.executeToolCalls(assistantMsg.toolCalls)
      }

      // Max iterations reached
      const finalMsg = 'Maximum iterations reached. Let me summarize what I found...'
      this.setStatus('completed')
      this.emit({ type: 'final_message', data: finalMsg })
      return finalMsg
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      this.setStatus('error')
      this.emit({ type: 'error', data: errorMessage })
      throw err
    }
  }

  /**
   * Approve a pending action (human-in-the-loop).
   * Note: this method is replaced during an active approval request.
   */
  async approve(): Promise<void> {
    // No-op when no approval is pending.
    // The real implementation is set dynamically in run().
  }

  /**
   * Reject a pending action (human-in-the-loop).
   * Note: this method is replaced during an active approval request.
   */
  async reject(_reason?: string): Promise<void> {
    // No-op when no approval is pending.
  }

  /** Get the pending approval request, if any */
  getPendingApproval(): ApprovalRequest | null {
    return this.pendingApproval
  }

  /** Cancel the current run */
  cancel(): void {
    this.abortController?.abort()
    if (this.status === 'running') {
      this.setStatus('error')
    }
  }

  /** Reset the conversation */
  reset(): void {
    this.messages = []
    this.status = 'idle'
    this.pendingApproval = null
  }

  // --- Internal methods ---

  private async continueLoop(remainingIterations: number): Promise<string> {
    let iterations = 0

    while (iterations < remainingIterations) {
      iterations++

      const assistantMsg = await this.provider.chatComplete({
        messages: this.buildMessagesWithSystemPrompt(),
        tools: this.getAvailableTools(),
        model: this.config.model,
        temperature: this.config.temperature,
        signal: this.abortController?.signal,
      })

      this.messages.push(assistantMsg)

      if (!assistantMsg.toolCalls || assistantMsg.toolCalls.length === 0) {
        this.emit({ type: 'step', data: {
          type: 'message',
          content: assistantMsg.content,
          timestamp: Date.now(),
        } as AgentStep })
        this.setStatus('completed')
        this.emit({ type: 'final_message', data: assistantMsg.content })
        return assistantMsg.content
      }

      await this.executeToolCalls(assistantMsg.toolCalls)
    }

    const finalMsg = 'Maximum iterations reached.'
    this.setStatus('completed')
    this.emit({ type: 'final_message', data: finalMsg })
    return finalMsg
  }

  private async executeToolCalls(toolCalls: ToolCall[]): Promise<void> {
    for (const toolCall of toolCalls) {
      const tool = this.tools.get(toolCall.name)
      if (!tool) {
        const result: ToolResult = {
          success: false,
          content: `Error: Tool '${toolCall.name}' not found.`,
          error: 'Tool not found',
        }
        this.appendToolResult(toolCall.id, toolCall.name, result)
        continue
      }

      this.emit({ type: 'step', data: {
        type: 'tool_call',
        content: `Calling ${toolCall.name}...`,
        toolName: toolCall.name,
        toolCallId: toolCall.id,
        toolArgs: toolCall.arguments,
        timestamp: Date.now(),
      } as AgentStep })

      try {
        const context: ToolContext = {
          agentId: this.config.id,
          conversationId: 'default',
          signal: this.abortController?.signal,
        }
        const result = await tool.execute(toolCall.arguments, context)
        this.appendToolResult(toolCall.id, toolCall.name, result)

        this.emit({ type: 'step', data: {
          type: 'tool_result',
          content: result.content,
          toolName: toolCall.name,
          toolCallId: toolCall.id,
          success: result.success,
          timestamp: Date.now(),
        } as AgentStep })
      } catch (err) {
        const errorResult: ToolResult = {
          success: false,
          content: `Error: ${err instanceof Error ? err.message : String(err)}`,
          error: err instanceof Error ? err.message : String(err),
        }
        this.appendToolResult(toolCall.id, toolCall.name, errorResult)

        this.emit({ type: 'step', data: {
          type: 'tool_result',
          content: errorResult.content,
          toolName: toolCall.name,
          toolCallId: toolCall.id,
          success: false,
          timestamp: Date.now(),
        } as AgentStep })
      }
    }
  }

  private appendToolResult(toolCallId: string, toolName: string, result: ToolResult): void {
    this.messages.push({
      role: 'tool',
      toolCallId,
      content: result.content,
    })
  }

  private buildMessagesWithSystemPrompt(): ChatMessage[] {
    const systemMsg: ChatMessage = {
      role: 'system',
      content: this.config.systemPrompt,
    }
    return [systemMsg, ...this.messages]
  }

  private isHighRiskTool(toolName: string): boolean {
    // Tools that can move money require human approval
    const highRiskTools = ['place_order', 'cancel_order', 'transfer', 'execute_trade']
    return highRiskTools.includes(toolName) || toolName.startsWith('trade_')
  }

  private setStatus(status: AgentRunStatus): void {
    this.status = status
    this.emit({ type: 'status_change', data: status })
  }

  private emit(event: { type: AgentEventType; data: unknown }): void {
    for (const listener of this.listeners) {
      listener(event)
    }
  }
}
