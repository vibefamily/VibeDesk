/**
 * MarketDataAggregator - aggregates market data from multiple providers.
 *
 * Routes requests to the appropriate provider and supports cross-provider
 * data comparison (useful for cross-chain stock token arbitrage).
 */

import type {
  CandleData,
  Instrument,
  OrderBookData,
  TickData,
  TradeData,
} from '@vibe/shared'
import { eventBus } from '../events/EventBus'
import type { IMarketDataAggregator, IMarketDataProvider, Timeframe } from './types'

export class MarketDataAggregator implements IMarketDataAggregator {
  private providers = new Map<string, IMarketDataProvider>()

  registerProvider(provider: IMarketDataProvider): void {
    if (this.providers.has(provider.id)) {
      console.warn(`[MarketData] Provider '${provider.id}' already registered, overwriting.`)
    }
    this.providers.set(provider.id, provider)
  }

  getProvider(id: string): IMarketDataProvider | undefined {
    return this.providers.get(id)
  }

  listProviders(): IMarketDataProvider[] {
    return Array.from(this.providers.values())
  }

  /**
   * Get tick data from all providers that support the given symbol.
   * Returns a map of providerId -> TickData.
   */
  async getTicksAll(symbol: string): Promise<Map<string, TickData>> {
    const results = new Map<string, TickData>()
    const promises = this.listProviders().map(async (provider) => {
      try {
        const tick = await provider.getTick(symbol)
        results.set(provider.id, tick)
      } catch {
        // Provider doesn't support this symbol or is down - skip silently
      }
    })
    await Promise.all(promises)
    return results
  }

  getBestProvider(symbol: string): IMarketDataProvider | undefined {
    // Simple heuristic: first registered provider.
    // In production this would consider liquidity, fees, latency, etc.
    return this.listProviders().at(0)
  }

  // --- Convenience pass-through methods (use best provider) ---

  async getTick(symbol: string, providerId?: string): Promise<TickData> {
    const provider = providerId ? this.getProvider(providerId) : this.getBestProvider(symbol)
    if (!provider) throw new Error(`No provider available for symbol ${symbol}`)
    return provider.getTick(symbol)
  }

  async getCandles(
    symbol: string,
    timeframe: Timeframe,
    options?: { limit?: number; startTime?: number; endTime?: number },
    providerId?: string,
  ): Promise<CandleData[]> {
    const provider = providerId ? this.getProvider(providerId) : this.getBestProvider(symbol)
    if (!provider) throw new Error(`No provider available for symbol ${symbol}`)
    return provider.getCandles(symbol, timeframe, options)
  }

  async getOrderBook(symbol: string, limit?: number, providerId?: string): Promise<OrderBookData> {
    const provider = providerId ? this.getProvider(providerId) : this.getBestProvider(symbol)
    if (!provider) throw new Error(`No provider available for symbol ${symbol}`)
    return provider.getOrderBook(symbol, limit)
  }

  async getInstruments(providerId?: string): Promise<Instrument[]> {
    if (providerId) {
      const p = this.getProvider(providerId)
      if (!p) throw new Error(`Provider ${providerId} not found`)
      return p.getInstruments()
    }
    const all = await Promise.all(this.listProviders().map((p) => p.getInstruments()))
    return all.flat()
  }

  async getRecentTrades(symbol: string, limit?: number, providerId?: string): Promise<TradeData[]> {
    const provider = providerId ? this.getProvider(providerId) : this.getBestProvider(symbol)
    if (!provider) throw new Error(`No provider available for symbol ${symbol}`)
    return provider.getRecentTrades(symbol, limit)
  }

  /**
   * Emit a tick event on the global event bus.
   * Data sources should call this to publish ticks.
   */
  publishTick(tick: TickData): void {
    eventBus.emit({ type: 'tick', data: tick })
  }
}
