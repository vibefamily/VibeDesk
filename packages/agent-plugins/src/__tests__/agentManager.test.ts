/**
 * AgentManager tests.
 *
 * Covers template registration, rule-mode analysis cycles, LLM-mode
 * runs with a fake provider, status transitions and re-entrancy guard.
 */

import { describe, expect, it } from 'vitest'
import { MarketDataAggregator } from '@vibe/core'
import type { IMarketDataProvider } from '@vibe/core'
import type { Instrument, OrderBookData, TickData } from '@vibe/shared'
import { AgentManager } from '../AgentManager'
import { BUILTIN_TEMPLATES } from '../templates'
import type { ChatMessage, LLMProvider, ToolDefinition } from '../runtime/types'

class FakeMarketProvider implements IMarketDataProvider {
  readonly id: string
  readonly isConnected = true
  constructor(id: string) {
    this.id = id
  }
  async connect(): Promise<void> {}
  async disconnect(): Promise<void> {}
  async getInstruments(): Promise<Instrument[]> {
    return []
  }
  async getInstrument(): Promise<Instrument | null> {
    return null
  }
  async getTick(symbol: string): Promise<TickData> {
    return {
      timestamp: 1,
      symbol,
      bidPrice: 0,
      bidSize: 0,
      askPrice: 0,
      askSize: 0,
      lastPrice: this.id === 'a' ? 100 : 99,
      change24h: this.id === 'a' ? 0.02 : 0.01,
    }
  }
  async getOrderBook(): Promise<OrderBookData> {
    return { symbol: 'X', timestamp: 1, bids: [], asks: [] }
  }
  async getCandles() {
    return []
  }
  async getRecentTrades() {
    return []
  }
  async subscribeTicks() {
    return () => undefined
  }
  async subscribeCandles() {
    return () => undefined
  }
  async subscribeOrderBook() {
    return () => undefined
  }
  async subscribeTrades() {
    return () => undefined
  }
}

function makeMarket(): MarketDataAggregator {
  const agg = new MarketDataAggregator()
  agg.registerProvider(new FakeMarketProvider('a'))
  agg.registerProvider(new FakeMarketProvider('b'))
  return agg
}

/** Fake LLM that always replies with plain text (no tool calls). */
function makeFakeLlm(reply: string): LLMProvider {
  return {
    id: 'fake',
    async chatComplete(): Promise<ChatMessage> {
      return { role: 'assistant', content: reply }
    },
  }
}

describe('AgentManager', () => {
  it('registers the built-in templates', () => {
    const manager = new AgentManager({ market: makeMarket() })
    expect(manager.listTemplates().map((t) => t.id).sort()).toEqual([
      'news-collector',
      'stock-analyst',
    ])
    expect(BUILTIN_TEMPLATES).toHaveLength(2)
  })

  it('runs a stock analyst in rule mode and records output', async () => {
    const manager = new AgentManager({ market: makeMarket() })
    const view = manager.create('stock-analyst', { symbols: ['TSLA'] })
    expect(view.mode).toBe('rule')
    expect(view.status).toBe('idle')

    await manager.runOnce(view.id)

    const after = manager.get(view.id)!
    expect(after.status).toBe('completed')
    expect(after.lastMessage).toContain('TSLA')
    expect(after.lastMessage).toContain('HOLD')
    expect(after.messages.length).toBeGreaterThanOrEqual(1)
  })

  it('emits status events during a run', async () => {
    const manager = new AgentManager({ market: makeMarket() })
    const events: string[] = []
    manager.onEvent((e) => {
      if (e.type === 'status') events.push(e.status)
    })
    const view = manager.create('stock-analyst', { symbols: ['TSLA'] })
    await manager.runOnce(view.id)
    expect(events).toContain('running')
    expect(events).toContain('completed')
  })

  it('switches to LLM mode and builds an agent when configured', async () => {
    const manager = new AgentManager({ market: makeMarket() })
    expect(manager.getMode()).toBe('rule')

    manager.setLlmConfig({
      baseUrl: 'https://fake.local/v1',
      apiKey: 'sk-test',
      model: 'fake-model',
    })
    expect(manager.getMode()).toBe('llm')

    const view = manager.create('stock-analyst', { symbols: ['TSLA'] })
    expect(view.mode).toBe('llm')

    // The managed agent must exist in LLM mode.
    const managed = (
      manager as unknown as {
        agents: Map<string, { agent: { provider: LLMProvider } | null }>
      }
    ).agents.get(view.id)
    expect(managed?.agent).not.toBeNull()
  })

  it('guards against re-entrant runs', async () => {
    const manager = new AgentManager({ market: makeMarket() })
    const view = manager.create('stock-analyst', { symbols: ['TSLA'] })
    // Start two concurrent cycles; the second must be a no-op.
    await Promise.all([manager.runOnce(view.id), manager.runOnce(view.id)])
    expect(manager.get(view.id)!.status).toBe('completed')
  })

  it('stop() clears the scheduler and marks stopped', async () => {
    const manager = new AgentManager({ market: makeMarket() })
    const view = manager.create('stock-analyst', { symbols: ['TSLA'] })
    manager.start(view.id)
    expect(manager.get(view.id)!.status).toBe('running')
    manager.stop(view.id)
    expect(manager.get(view.id)!.status).toBe('stopped')
  })
})

describe('AgentManager.chat', () => {
  it('rejects chat in rule mode (no LLM key)', async () => {
    const manager = new AgentManager({ market: makeMarket() })
    const view = manager.create('stock-analyst', { symbols: ['TSLA'] })
    await expect(manager.chat(view.id, 'hello')).rejects.toThrow(/LLM mode/)
  })

  it('chats with an agent in LLM mode and records user + reply lines', async () => {
    const manager = new AgentManager({ market: makeMarket() })
    manager.setLlmConfig({
      baseUrl: 'https://fake.local/v1',
      apiKey: 'sk-test',
      model: 'fake-model',
    })
    // Swap the real provider for a stub that echoes the user's question.
    const managed = (
      manager as unknown as {
        agents: Map<string, { agent: { provider: LLMProvider } | null }>
      }
    ).agents
    const view = manager.create('stock-analyst', { symbols: ['TSLA'] })
    const agent = managed.get(view.id)!.agent!
    agent.provider = {
      chatComplete: async ({
        messages,
      }: {
        messages: ChatMessage[]
        tools?: ToolDefinition[]
        model: string
        temperature?: number
        signal?: AbortSignal
        onStream?: (delta: string) => void
      }) => ({
        role: 'assistant',
        content: `echo: ${messages.at(-1)?.content}`,
        toolCalls: [],
      }),
    } as unknown as LLMProvider

    const after = await manager.chat(view.id, 'Is TSLA cheap?')
    expect(after.status).toBe('completed')
    expect(after.lastMessage).toContain('Is TSLA cheap?')

    const kinds = after.messages.map((m) => `${m.kind}:${m.role ?? ''}`)
    // user line first, then the assistant reply
    expect(kinds[0]).toBe('message:user')
    expect(after.messages.some((m) => m.role === 'user' && m.content === 'Is TSLA cheap?')).toBe(
      true,
    )
    expect(after.messages.some((m) => m.kind === 'message' && m.content.includes('echo:'))).toBe(
      true,
    )
  })
})
