/**
 * Quick integration check for PiAgent (VibeDesk LLM runtime adapter).
 * Uses the user's configured OpenAI-compatible key (Volcano Ark).
 * Run: npx tsx scripts/piagent-check.ts
 */
import { PiAgent } from '../src/runtime/PiAgent'
import type { ToolDefinition } from '../src/runtime/types'

const getPriceTool: ToolDefinition = {
  name: 'get_price',
  description: 'Get the current price for a US stock symbol (TSLA, NVDA, AAPL).',
  parameters: {
    type: 'object',
    properties: {
      symbol: { type: 'string', description: 'Ticker symbol' },
    },
    required: ['symbol'],
  },
  execute: async (args) => {
    const sym = String(args.symbol ?? 'TSLA')
    return {
      success: true,
      content: JSON.stringify({ symbol: sym, price: sym === 'TSLA' ? 412.4 : 138.2, sources: ['robinhood', 'yahoo', 'hyperliquid', 'binance'] }),
    }
  },
}

const agent = new PiAgent({
  agentId: 'test-agent',
  agentName: 'Test Agent',
  baseUrl: 'https://ark.cn-beijing.volces.com/api/plan/v3',
  apiKey,
  model: 'ark-code-latest',
  systemPrompt: 'You are a helpful trading assistant. Use get_price for price questions.',
  tools: [getPriceTool],
  piAgentDir: '/tmp/vibedesk-pi-check',
})

agent.onEvent((e) => {
  if (e.type === 'step') console.log('[event] step:', JSON.stringify(e.data).slice(0, 120))
  if (e.type === 'final_message') console.log('[event] final_message:', String(e.data).slice(0, 200))
  if (e.type === 'error') console.error('[event] error:', e.data)
})

async function main() {
  console.log('[check] round 1: tool call')
  const out1 = await agent.run('What is the price of TSLA? Use get_price, then reply briefly.')
  console.log('[check] out1 length:', out1.length)
  console.log('[check] round 2: follow-up (context continuity)')
  const out2 = await agent.run('Same question for NVDA now.')
  console.log('[check] out2 length:', out2.length)
  console.log('[check] messages:', agent.getMessages().length)
  agent.dispose()
  console.log('[check] SUCCESS')
}

main().catch((e) => {
  console.error('[check] FAILED:', e)
  agent.dispose()
  process.exitCode = 1
})
