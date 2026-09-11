/**
 * Built-in agent templates.
 *
 * Two templates are shipped with VibeDesk:
 * - stock-analyst: monitors stocks across data sources, compares prices
 *   and emits trade recommendations with reasons and risks.
 * - news-collector: pulls the latest public headlines for tracked
 *   symbols and summarizes them for the rest of the system.
 *
 * More templates can be registered at runtime (plugin-style).
 */

import type { AgentConfig } from './runtime/types'

/** Metadata + factory for an agent template. */
export interface AgentTemplate {
  id: string
  name: string
  description: string
  icon: string
  /** Polling interval in ms when the agent is started. */
  defaultIntervalMs: number
  /** Symbols the agent tracks by default. */
  defaultSymbols: string[]
  /** Tool names the agent may use (must be registered). */
  tools: string[]
  buildConfig: (id: string, name: string, model: string) => AgentConfig
  /** Prompt used for one scheduled run. */
  buildPrompt: (symbols: string[]) => string
}

const ANALYST_SYSTEM_PROMPT = [
  'You are VibeDesk, a local-first stock market analyst agent.',
  'You monitor the same stock across multiple independent data sources (Robinhood, Yahoo Finance, Hyperliquid, Binance).',
  'Your job: compare prices across sources, identify meaningful spreads, consider momentum, and produce a clear recommendation (BUY / SELL / HOLD) with reasons and risks.',
  'Use the market tools to fetch live data. Never invent prices - only report what the tools return.',
  'If a source is unavailable, say so explicitly. Mention the wallet this recommendation applies to only if an authorized wallet exists.',
  'Keep the final answer concise and structured.',
].join('\n')

const NEWS_SYSTEM_PROMPT = [
  'You are VibeDesk, a local-first news collection agent.',
  'Your job: fetch the latest public headlines for the tracked symbols and summarize what could matter for their price.',
  'Use the fetch_news tool. Report the headline, source time, and a one-line takeaway per item.',
  'Never fabricate headlines - only report what the tool returns.',
  'Keep the final summary tight and skimmable.',
].join('\n')

export const STOCK_ANALYST_TEMPLATE: AgentTemplate = {
  id: 'stock-analyst',
  name: 'Stock Analyst',
  description:
    'Monitors tracked stocks across all data sources, compares prices and emits BUY / SELL / HOLD recommendations with reasons and risks.',
  icon: '📈',
  defaultIntervalMs: 300_000,
  defaultSymbols: ['TSLA', 'NVDA'],
  tools: ['get_price', 'compare_prices', 'list_authorized_wallets', 'read_information'],
  buildConfig: (id, name, model) => ({
    id,
    name,
    systemPrompt: ANALYST_SYSTEM_PROMPT,
    model,
    maxIterations: 6,
    temperature: 0.4,
    tools: ['get_price', 'compare_prices', 'list_authorized_wallets', 'read_information'],
  }),
  buildPrompt: (symbols) =>
    [
      `Analyze the following stocks now: ${symbols.join(', ')}.`,
      'For each symbol: fetch live prices across sources, compare them, note the cross-source spread,',
      'then give a recommendation with reasons and risks.',
    ].join(' '),
}

export const NEWS_COLLECTOR_TEMPLATE: AgentTemplate = {
  id: 'news-collector',
  name: 'News Collector',
  description:
    'Pulls the latest public headlines for tracked symbols and summarizes the ones that could move the price.',
  icon: '📰',
  defaultIntervalMs: 600_000,
  defaultSymbols: ['TSLA', 'NVDA'],
  tools: ['fetch_news'],
  buildConfig: (id, name, model) => ({
    id,
    name,
    systemPrompt: NEWS_SYSTEM_PROMPT,
    model,
    maxIterations: 4,
    temperature: 0.3,
    tools: ['fetch_news'],
  }),
  buildPrompt: (symbols) =>
    `Fetch and summarize the latest headlines for: ${symbols.join(', ')}.`,
}


const GENERAL_SYSTEM_PROMPT = [
  'You are VibeDesk, a local-first AI assistant for personal trading.',
  'You have direct access to live market data (Robinhood, Yahoo Finance, Hyperliquid, Binance),',
  'a local information center (news, tweets), and the user\'s local wallet vault (read-only, if authorized).',
  'You can answer general questions, discuss markets, explain concepts, or dive deep into a specific stock or topic.',
  'Use your tools whenever the answer needs real data - never invent prices, headlines or balances.',
  'If a source is unavailable or a tool fails, say so explicitly.',
  'Be concise, structured and honest about uncertainty.',
].join('\n')

/** General-purpose chat assistant - the default home screen of the chat center. */
export const GENERAL_CHAT_TEMPLATE: AgentTemplate = {
  id: 'general-chat',
  name: 'General Chat',
  description:
    'Free-form chat with a market-aware assistant. Ask anything, or go deep on a stock, a news topic or your portfolio.',
  icon: '💬',
  defaultIntervalMs: 0,
  defaultSymbols: [],
  tools: ['get_price', 'compare_prices', 'fetch_news', 'read_information', 'list_authorized_wallets'],
  buildConfig: (id, name, model) => ({
    id,
    name,
    systemPrompt: GENERAL_SYSTEM_PROMPT,
    model,
    maxIterations: 8,
    temperature: 0.7,
    tools: ['get_price', 'compare_prices', 'fetch_news', 'read_information', 'list_authorized_wallets'],
  }),
  buildPrompt: () =>
    'Open-ended conversation - respond to whatever the user is asking, using tools when real data is needed.',
}

/** All built-in templates. */
export const BUILTIN_TEMPLATES: AgentTemplate[] = [
  GENERAL_CHAT_TEMPLATE,
  STOCK_ANALYST_TEMPLATE,
  NEWS_COLLECTOR_TEMPLATE,
]
