/**
 * Market data provider interfaces.
 *
 * All data sources (CEX, DEX, chain, etc.) implement these interfaces
 * so the rest of the system can work with a unified data model.
 */

import type { CandleData, Instrument, OrderBookData, TickData, TradeData } from '@vibe/shared'

/** Timeframe string format */
export type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1d' | '1w'

/** Subscription callback types */
export type TickCallback = (tick: TickData) => void
export type CandleCallback = (candle: CandleData, symbol: string) => void
export type OrderBookCallback = (orderBook: OrderBookData) => void
export type TradeCallback = (trade: TradeData) => void

/**
 * Market data provider interface.
 *
 * Implementations connect to specific exchanges / chains and
 * provide both REST (historical) and WebSocket (real-time) data.
 */
export interface IMarketDataProvider {
  /** Provider identifier (e.g., 'binance', 'solana-jupiter') */
  readonly id: string
  /** Whether the provider is currently connected */
  readonly isConnected: boolean

  // --- Connection ---
  connect(): Promise<void>
  disconnect(): Promise<void>

  // --- Instrument metadata ---
  getInstruments(): Promise<Instrument[]>
  getInstrument(symbol: string): Promise<Instrument | null>

  // --- REST / Historical data ---
  getTick(symbol: string): Promise<TickData>
  getOrderBook(symbol: string, limit?: number): Promise<OrderBookData>
  getCandles(
    symbol: string,
    timeframe: Timeframe,
    options?: {
      limit?: number
      startTime?: number
      endTime?: number
    },
  ): Promise<CandleData[]>
  getRecentTrades(symbol: string, limit?: number): Promise<TradeData[]>

  // --- WebSocket / Real-time subscriptions ---
  subscribeTicks(symbol: string, callback: TickCallback): Promise<() => void>
  subscribeCandles(symbol: string, timeframe: Timeframe, callback: CandleCallback): Promise<() => void>
  subscribeOrderBook(symbol: string, callback: OrderBookCallback): Promise<() => void>
  subscribeTrades(symbol: string, callback: TradeCallback): Promise<() => void>
}

/**
 * Market data aggregator - combines data from multiple providers.
 *
 * This is the entry point for the rest of the system to get market data.
 * It routes requests to the correct provider and can do cross-source
 * comparison / aggregation.
 */
export interface IMarketDataAggregator {
  /** Register a new data provider */
  registerProvider(provider: IMarketDataProvider): void

  /** Get a provider by ID */
  getProvider(id: string): IMarketDataProvider | undefined

  /** List all registered providers */
  listProviders(): IMarketDataProvider[]

  /** Get tick data across all providers for a symbol */
  getTicksAll(symbol: string): Promise<Map<string, TickData>>

  /** Get the best (most liquid) provider for a symbol */
  getBestProvider(symbol: string): IMarketDataProvider | undefined
}
