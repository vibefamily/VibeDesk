/**
 * Agent runtime type definitions.
 *
 * Defines the core abstractions: Agent, Tool, Message, and the agent loop.
 * Designed to be provider-agnostic — can work with DeepSeek, OpenAI,
 * Anthropic, or local models.
 */

/** A single message in a conversation */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  /** Tool call ID (for tool role messages) */
  toolCallId?: string
  /** Tool calls made by the assistant */
  toolCalls?: ToolCall[]
}

/** A tool call from the model */
export interface ToolCall {
  id: string
  name: string
  arguments: Record<string, unknown>
}

/** Tool execution result */
export interface ToolResult {
  /** Whether the tool call succeeded */
  success: boolean
  /** Result data (stringified for LLM consumption) */
  content: string
  /** Optional structured data for UI display */
  data?: unknown
  /** Error message if success is false */
  error?: string
}

/** Tool definition */
export interface ToolDefinition {
  /** Unique tool name */
  name: string
  /** Human-readable description (sent to LLM) */
  description: string
  /** JSON Schema for tool parameters */
  parameters: Record<string, unknown>
  /** Execute the tool with given arguments */
  execute: (args: Record<string, unknown>, context: ToolContext) => Promise<ToolResult>
}

/** Context passed to tool execution functions */
export interface ToolContext {
  /** Agent that's executing the tool */
  agentId: string
  /** Current conversation ID */
  conversationId: string
  /** Abort signal for long-running operations */
  signal?: AbortSignal
}

/** Agent configuration */
export interface AgentConfig {
  /** Agent ID */
  id: string
  /** Agent name */
  name: string
  /** System prompt / instructions */
  systemPrompt: string
  /** Model identifier (provider-specific) */
  model: string
  /** Maximum number of tool call iterations per user turn */
  maxIterations: number
  /** Temperature (0-2) */
  temperature: number
  /** List of tool names this agent can use */
  tools: string[]
}

/** LLM provider interface */
export interface LLMProvider {
  /** Provider ID */
  id: string
  /**
   * Send a chat completion request with tool calling support.
   * Returns the assistant message (which may contain tool calls).
   */
  chatComplete(params: {
    messages: ChatMessage[]
    tools?: ToolDefinition[]
    model: string
    temperature?: number
    signal?: AbortSignal
    /** Optional streaming callback for token-by-token output */
    onStream?: (delta: string) => void
  }): Promise<ChatMessage>
}

/** Agent run step - a single iteration of the agent loop */
export interface AgentStep {
  /** Step type: thought (text), tool_call, tool_result */
  type: 'message' | 'tool_call' | 'tool_result'
  /** Content of the step */
  content: string
  /** Tool name if type is tool_call or tool_result */
  toolName?: string
  /** Tool call ID */
  toolCallId?: string
  /** Tool arguments (for tool_call) */
  toolArgs?: Record<string, unknown>
  /** Whether the tool call succeeded (for tool_result) */
  success?: boolean
  /** Timestamp */
  timestamp: number
}

/** Agent run state */
export type AgentRunStatus = 'idle' | 'running' | 'awaiting_approval' | 'completed' | 'error'

/**
 * Human-in-the-loop approval request.
 * When the agent wants to execute a high-impact action,
 * it pauses and waits for human approval.
 */
export interface ApprovalRequest {
  id: string
  agentId: string
  conversationId: string
  /** What the agent wants to do */
  action: string
  /** Detailed reasoning */
  reasoning: string
  /** Confidence level 0-1 */
  confidence: number
  /** Tool calls that require approval */
  toolCalls: ToolCall[]
  /** Risk warnings */
  riskWarnings: string[]
  /** Timestamp */
  timestamp: number
}

/** Agent event types for streaming updates */
export type AgentEventType =
  | 'step'
  | 'status_change'
  | 'approval_request'
  | 'assistant_start'
  | 'stream_delta'
  | 'thinking_delta'
  | 'final_message'
  | 'error'
