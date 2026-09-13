/**
 * PiAgent session persistence check (M7-3).
 *
 * Verifies that a pi conversation survives across agent instances by
 * resuming the persisted session JSONL file (the same path VibeDesk takes
 * on restart: AgentManager persists view.piSessionFile and passes it back
 * into PiAgent on the next boot).
 *
 * Requires VIBE_AI_KEY in the environment.
 * Run: VIBE_AI_KEY=<key> npx tsx scripts/piagent-session-check.ts
 */
import { rmSync } from 'node:fs'
import { PiAgent } from '../src/runtime/PiAgent'
import type { ToolDefinition } from '../src/runtime/types'

const apiKey = process.env.VIBE_AI_KEY
if (!apiKey) {
  console.error('[check] VIBE_AI_KEY is required (OpenAI-compatible API key)')
  process.exit(1)
}

const AGENT_DIR = '/tmp/vibedesk-pi-session-check'

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
      content: JSON.stringify({ symbol: sym, price: sym === 'TSLA' ? 412.4 : 138.2 }),
    }
  },
}

function makeAgent(sessionFile: string | null): PiAgent {
  return new PiAgent({
    agentId: 'session-check',
    agentName: 'Session Check',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/plan/v3',
    apiKey,
    model: 'ark-code-latest',
    systemPrompt: 'You are a helpful assistant. Use get_price for price questions. Keep answers short.',
    tools: [getPriceTool],
    piAgentDir: AGENT_DIR,
    sessionFile,
  })
}

async function main() {
  rmSync(AGENT_DIR, { recursive: true, force: true })

  console.log('[check] instance A: first conversation')
  const agentA = makeAgent(null)
  const out1 = await agentA.run('What is the price of TSLA?')
  const sessionFile = agentA.getSessionFile()
  console.log('[check] session file:', sessionFile)
  console.log('[check] A says:', out1.slice(0, 80))
  agentA.dispose()
  if (!sessionFile) throw new Error('[check] FAILED: no session file was produced')

  console.log('[check] instance B: resume the same session')
  const agentB = makeAgent(sessionFile)
  const out2 = await agentB.run('Without tools, briefly restate what my previous question asked about.')
  console.log('[check] B says:', out2.slice(0, 120))
  agentB.dispose()

  // Context continuity: B should reference TSLA / the earlier question.
  const recovered = /tsla|tesla|previous question|earlier/i.test(out2)
  if (!recovered) {
    console.error('[check] FAILED: resumed session does not remember the earlier conversation')
    process.exitCode = 1
    return
  }
  console.log('[check] SUCCESS: session resumed with context continuity')
}

main().catch((e) => {
  console.error('[check] FAILED:', e)
  process.exitCode = 1
})
