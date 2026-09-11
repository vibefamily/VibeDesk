/**
 * MarketDataAggregator unit tests.
 *
 * Covers the cross-provider aggregation contract: successful providers
 * are collected, failing providers are skipped, and best-provider
 * fallback behaves sanely.
 */

import { describe, expect, it } from 'vitest'
import type { CandleData, Instrument, OrderBookData, TickData, TradeData } from '@vibe/shared'
import type { IMarketDataProvider, Timeframe } from '../types'
import { MarketDataAggregator } from '../MarketDataAggregator'

class FakeProvider implements IMarketDataProvider {
  readonly id: string
  readonly isConnected = true
  private fail: boolean

  constructor(id: string, fail = false) {
    this.id = id
    this.fail = fail
  }

  async connect(): Promise<void> {}
  async disconnect(): Promise<void> {}
  async getInstruments(): Promise<Instrument[]> {
    return []
  }
  async getInstrument(symbol: string): Promise<Instrument | null> {
    return null
  }
  async getTick(symbol: string): Promise<TickData> {
    if (this.fail) {
      throw new Error(`${this.id} does not support ${symbol}`)
    }
    return {
      timestamp: 1,
      symbol,
      bidPrice: 0,
      bidSize: 0,
      askPrice: 0,
      askSize: 0,
      lastPrice: this.id === 'a' ? 100 : 101,
    }
  }
  async getOrderBook(): Promise<OrderBookData> {
    return { symbol: 'X', timestamp: 1, bids: [], asks: [] }
  }
  async getCandles(): Promise<CandleData[]> {
    return []
  }
  async getRecentTrades(): Promise<TradeData[]> {
    return []
  }
  async subscribeTicks(): Promise<() => void> {
    return () => undefined
  }
  async subscribeCandles(): Promise<() => void> {
    return () => undefined
  }
  async subscribeOrderBook(): Promise<() => void> {
    return () => undefined
  }
  async subscribeTrades(): Promise<() => void> {
    return () => undefined
  }
}

describe('MarketDataAggregator', () => {
  it('collects ticks from providers that support the symbol', async () => {
    const agg = new MarketDataAggregator()
    agg.registerProvider(new FakeProvider('a'))
    agg.registerProvider(new FakeProvider('b'))
    const ticks = await agg.getTicksAll('TSLA')
    expect(ticks.size).toBe(2)
    expect(ticks.get('a')?.lastPrice).toBe(100)
    expect(ticks.get('b')?.lastPrice).toBe(101)
  })

  it('skips providers that fail for a symbol', async () => {
    const agg = new MarketDataAggregator()
    agg.registerProvider(new FakeProvider('ok'))
    agg.registerProvider(new FakeProvider('bad', true))
    const ticks = await agg.getTicksAll('TSLA')
    expect(ticks.size).toBe(1)
    expect(ticks.get('ok')?.lastPrice).toBe(101)
    expect(ticks.has('bad')).toBe(false)
  })

  it('registers providers idempotently by id', async () => {
    const agg = new MarketDataAggregator()
    agg.registerProvider(new FakeProvider('a'))
    agg.registerProvider(new FakeProvider('a'))
    expect(agg.listProviders().length).toBe(1)
    expect(agg.getProvider('a')).toBeDefined()
  })

  it('returns best provider as the first registered one', () => {
    const agg = new MarketDataAggregator()
    const a = new FakeProvider('a')
    const b = new FakeProvider('b')
    agg.registerProvider(a)
    agg.registerProvider(b)
    expect(agg.getBestProvider('X')).toBe(a)
  })
})
