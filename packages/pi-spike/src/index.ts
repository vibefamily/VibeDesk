/**
 * Pi runtime spike for VibeDesk.
 *
 * Goal: verify that the @earendil-works/pi agent harness (the engine used by
 * openclaw) can run inside VibeDesk's Node 22 ESM environment with:
 *   1. an OpenAI-compatible provider (Volcano Ark, already configured in VibeDesk)
 *   2. one custom tool (get_price) defined via ToolDefinition + TypeBox schema
 *   3. AgentSession + Agent.prompt + waitForIdle round trip
 *
 * This is a throwaway spike on the feat/pi-runtime branch. It does not touch
 * the production AgentManager.
 */
import { Type } from 'typebox'
import { ModelRuntime, createAgentSession } from '@earendil-works/pi-coding-agent'
import type { ToolDefinition } from '@earendil-works/pi-coding-agent'
import type { AgentEvent } from '@earendil-works/pi-agent-core'

// ---------- provider config (OpenAI-compatible, Volcano Ark) ----------
const BASE_URL = 'https://ark.cn-beijing.volces.com/api/plan/v3'
const API_KEY = process.env.VIBE_AI_KEY ?? ''
const MODEL_ID = process.env.VIBE_AI_MODEL ?? 'ark-code-latest'

// ---------- custom tool: get_price ----------
const getPriceTool: ToolDefinition = {
  name: 'get_price',
  label: 'Get Price',
  description:
    'Fetch the current market price of a US stock symbol from live multi-source data (Robinhood/Yahoo/Hyperliquid/Binance).',
  promptSnippet: 'Use get_price to read the live price of a symbol across sources.',
  promptGuidelines: ['Always call get_price before answering price questions.'],
  parameters: Type.Object({
    symbol: Type.String({ description: 'US stock ticker, e.g. TSLA or NVDA' }),
  }),
  execute: async (toolCallId, params) => {
    const prices: Record<string, number> = {
      TSLA: 412.35,
      NVDA: 138.2,
      AAPL: 231.8,
    }
    const base = prices[params.symbol] ?? 100
    const sources = [
      { source: 'robinhood', price: base + 0.12 },
      { source: 'yahoo', price: base - 0.08 },
      { source: 'hyperliquid', price: base + 0.2 },
      { source: 'binance', price: base - 0.05 },
    ]
    return {
      metadata: { symbol: params.symbol, ts: Date.now() },
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            { symbol: params.symbol, sources, spreadPct: 0.08, timestamp: new Date().toISOString() },
            null,
            2,
          ),
        },
      ],
    }
  },
}

// ---------- event logger ----------
function logAgentEvent(event: AgentEvent): void {
  switch (event.type) {
    case 'message_end':
      console.log('[pi] message_end:')
      for (const block of event.message.content) {
        if (block.type === 'text') console.log('[pi]   text:', block.text.slice(0, 300))
        if (block.type === 'toolCall')
          console.log('[pi]   toolCall:', block.name, JSON.stringify(block.arguments).slice(0, 120))
      }
      break
    case 'error':
      console.error('[pi] error:', (event as { error?: unknown }).error ?? event)
      break
    default:
      break
  }
}

async function main(): Promise<void> {
  console.log('[spike] pi runtime spike start (pi-agent-core + pi-coding-agent 0.85.0)')
  console.log('[spike] model:', MODEL_ID, '@', BASE_URL)

  // 1. Model runtime with a registered OpenAI-compatible provider
  const modelRuntime = await ModelRuntime.create({ allowModelNetwork: false, refreshOnCreate: false })
  modelRuntime.registerProvider('vibedesk', {
    name: 'VibeDesk',
    apiKey: API_KEY,
    baseUrl: BASE_URL,
    api: 'openai-completions',
    models: [
      {
        id: MODEL_ID,
        name: MODEL_ID,
        reasoning: false,
        input: ['text'],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 65536,
        maxTokens: 4096,
        compat: { supportsDeveloperRole: false },
      },
    ],
  })
  const model = modelRuntime.getModel('vibedesk', MODEL_ID)
  if (!model) throw new Error('[spike] model not registered')

  // 2. Agent session: no built-in tools, one custom tool
  const { session } = await createAgentSession({
    cwd: process.cwd(),
    modelRuntime,
    model,
    thinkingLevel: 'off',
    noTools: 'builtin',
    customTools: [getPriceTool],
  })

  session.agent.subscribe(logAgentEvent)

  // 3. Round trip: ask the agent to use the tool
  console.log('[spike] prompting agent...')
  await session.agent.prompt(
    'What is the current price of TSLA? Please call the get_price tool, then summarize the prices from all sources.',
  )
  await session.agent.waitForIdle()

  const snapshot = session.agent.getSnapshot?.() ?? (session as unknown as { agent: { getContextUsage?: () => unknown } }).agent
  console.log('[spike] done. agent snapshot keys:', Object.keys(snapshot ?? {}).slice(0, 12))
  console.log('[spike] SUCCESS: pi AgentSession round trip completed')
}

main().catch((err) => {
  console.error('[spike] FAILED:', err)
  process.exitCode = 1
})
