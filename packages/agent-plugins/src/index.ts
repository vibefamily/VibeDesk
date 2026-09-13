/**
 * Agent plugins - multi-agent runtime, templates, tools and LLM glue.
 *
 * NOTE: this package imports @vibe/core (market aggregation), so it must
 * only run in the Electron main process / Node, never in the renderer.
 */

export { Agent, ToolRegistry, toolRegistry } from './runtime/index'
export type {
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
} from './runtime/types'
export { OpenAICompatibleProvider } from './llm/OpenAICompatibleProvider'
export type { OpenAIConfig } from './llm/OpenAICompatibleProvider'
export { AgentManager } from './AgentManager'
export type {
  AgentInstanceView,
  AgentManagerEvent,
  AgentManagerOptions,
  AgentMessageView,
  AgentMode,
  AgentViewStatus,
  LlmConfigFile,
  LlmProviderConfig,
} from './AgentManager'
export { BUILTIN_TEMPLATES, STOCK_ANALYST_TEMPLATE, NEWS_COLLECTOR_TEMPLATE } from './templates'
export type { AgentTemplate } from './templates'
export { analyzeStock } from './analysis/ruleAnalyst'
export type { StockAnalysis } from './analysis/ruleAnalyst'
export { createMarketTools } from './tools/marketTools'
export { createNewsTool, parseRssTitles } from './tools/newsTools'
export type { NewsItem } from './tools/newsTools'
export { createWalletReadTool } from './tools/walletTools'
export { createInfoReadTool } from './tools/infoTools'
export type { InfoStore } from './tools/infoTools'
export type { WalletReadAccess } from './tools/walletTools'
