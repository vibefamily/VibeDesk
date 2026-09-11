/**
 * DataSourceRegistry unit tests.
 */

import { describe, expect, it } from 'vitest'
import type { IMarketDataProvider } from '@vibe/core'
import { DataSourceRegistry } from './registry'
import type { ProviderManifest } from './registry'

class StubProvider implements IMarketDataProvider {
  readonly id: string
  readonly isConnected = true
  constructor(id: string) {
    this.id = id
  }
  async connect(): Promise<void> {}
  async disconnect(): Promise<void> {}
  async getInstruments() {
    return []
  }
  async getInstrument(_symbol: string) {
    return null
  }
  async getTick(symbol: string) {
    return { timestamp: 1, symbol, bidPrice: 0, bidSize: 0, askPrice: 0, askSize: 0, lastPrice: 1 }
  }
  async getOrderBook() {
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

const manifest = (id: string): ProviderManifest => ({
  id,
  name: id,
  kind: 'broker',
  assetScope: 'stocks',
  authRequired: false,
  updateMode: ['polling'],
  description: 'test',
})

describe('DataSourceRegistry', () => {
  it('registers provider + manifest and lists entries', () => {
    const registry = new DataSourceRegistry()
    registry.register(new StubProvider('a'), manifest('a'))
    registry.register(new StubProvider('b'), manifest('b'))
    expect(registry.list().length).toBe(2)
    expect(registry.get('a')?.provider.id).toBe('a')
    expect(registry.listManifests().map((m) => m.id)).toEqual(['a', 'b'])
  })

  it('rejects manifest whose id does not match the provider', () => {
    const registry = new DataSourceRegistry()
    expect(() => registry.register(new StubProvider('a'), manifest('b'))).toThrow(
      /does not match/,
    )
  })

  it('hasPrice returns false for unknown providers', async () => {
    const registry = new DataSourceRegistry()
    await expect(registry.hasPrice('nope', 'TSLA')).resolves.toBe(false)
  })
})
