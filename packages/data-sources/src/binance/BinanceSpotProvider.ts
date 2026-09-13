/**
 * Binance Spot market data provider.
 *
 * Implements IMarketDataProvider for Binance Spot REST API and WebSocket streams.
 * Uses the public API only - no API key required for market data.
 */

import type {
  CandleData,
  Instrument,
  OrderBookData,
  OrderBookLevel,
  TickData,
  TradeData,
} from '@vibe/shared'
import type { IMarketDataProvider, Timeframe } from '@vibe/core'
import { WebSocketManager } from '../common/websocket'
import type {
  BinanceExchangeInfo,
  BinanceKline,
  BinanceOrderBook,
  BinanceTicker24hr,
  BinanceTrade,
  BinanceWsDepth,
  BinanceWsKline,
  BinanceWsMiniTicker,
  BinanceWsTrade,
} from './types'

const REST_BASE = 'https://api.binance.com'
const WS_BASE = 'wss://stream.binance.com:9443/ws'

/**
 * Map a Binance timeframe string to seconds.
 */
function timeframeToSeconds(tf: string): number {
  const unit = tf.charAt(tf.length - 1)
  const value = parseInt(tf.slice(0, -1), 10)
  switch (unit) {
    case 'm': return value * 60
    case 'h': return value * 3600
    case 'd': return value * 86400
    case 'w': return value * 604800
    default: return 60
  }
}

/**
 * Binance Spot market data provider.
 *
 * Uses Binance public REST API for historical data and WebSocket streams
 * for real-time data. No authentication required for market data endpoints.
 */
export interface BinanceProviderConfig {
  apiKey?: string
  apiSecret?: string
}

export class BinanceSpotProvider implements IMarketDataProvider {
  readonly id = 'binance'
  /** Optional user credentials (kept in the main process, never in renderer). */
  readonly config: BinanceProviderConfig
  private _isConnected = false
  private ws: WebSocketManager | null = null
  private instrumentCache: Instrument[] = []
  private instrumentCacheTime = 0
  private cacheTtlMs = 3600_000 // 1 hour
  /** Human symbol (TSLA, BTC) -> Binance pair (TSLABUSDT, BTCUSDT). */
  private readonly symbolCache = new Map<string, string>()

  /**
   * Resolve a human-readable symbol to a tradable Binance pair.
   *
   * Binance lists tokenized stocks under `${TICKER}BUSDT` (TSLA -> TSLABUSDT),
   * while crypto pairs are `BTCUSDT` etc. The exchange info snapshot is
   * already cached for 1h, so resolving an unknown symbol costs one lookup
   * per symbol at most.
   */
  private async resolveSymbol(symbol: string): Promise<string> {
    const up = symbol.toUpperCase()
    const cached = this.symbolCache.get(up)
    if (cached) return cached
    const alreadyPair =
      up.length > 4 &&
      (up.endsWith('USDT') ||
        up.endsWith('BUSD') ||
        up.endsWith('FDUSD') ||
        up.endsWith('BTC') ||
        up.endsWith('ETH'))
    if (alreadyPair) {
      this.symbolCache.set(up, up)
      return up
    }
    try {
      const instruments = await this.getInstruments()
      const hit = instruments.find(
        (i) =>
          i.quoteAsset === 'USDT' &&
          (i.baseAsset === `${up}B` || i.baseAsset === up),
      )
      if (hit) {
        this.symbolCache.set(up, hit.symbol)
        return hit.symbol
      }
    } catch {
      // exchangeInfo failed; fall through to the raw symbol so the API
      // produces a clear per-symbol error instead of a silent failure
    }
    this.symbolCache.set(up, up)
    return up
  }

  constructor(config: BinanceProviderConfig = {}) {
    this.config = config
  }

  get isConnected(): boolean {
    return this._isConnected
  }

  async connect(): Promise<void> {
    this.ws = new WebSocketManager(WS_BASE)
    try {
      // Bound the WS handshake so a dead socket never blocks startup.
      await Promise.race([
        this.ws.connect(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Binance WS connect timeout')), 5_000),
        ),
      ])
      this._isConnected = true
    } catch {
      // WebSocket connection may fail but REST still works
      // We consider the provider "connected" if REST is reachable
      this._isConnected = true
    }
  }

  async disconnect(): Promise<void> {
    this.ws?.disconnect()
    this.ws = null
    this._isConnected = false
  }

  // --- Instrument metadata ---

  async getInstruments(): Promise<Instrument[]> {
    const now = Date.now()
    if (this.instrumentCache.length > 0 && now - this.instrumentCacheTime < this.cacheTtlMs) {
      return this.instrumentCache
    }

    const response = await fetch(`${REST_BASE}/api/v3/exchangeInfo`)
    if (!response.ok) {
      throw new Error(`Binance exchangeInfo failed: ${response.status}`)
    }
    const data = (await response.json()) as BinanceExchangeInfo

    const instruments: Instrument[] = data.symbols
      .filter((s) => s.status === 'TRADING' && s.isSpotTradingAllowed)
      .map((s): Instrument => {
        const priceFilter = s.filters.find((f) => f.filterType === 'PRICE_FILTER') as
          | { tickSize: string }
          | undefined
        const lotFilter = s.filters.find((f) => f.filterType === 'LOT_SIZE') as
          | { stepSize: string }
          | undefined
        const minNotionalFilter = s.filters.find((f) => f.filterType === 'MIN_NOTIONAL') as
          | { minNotional: string }
          | undefined

        const pricePrecision = priceFilter
          ? this.countDecimals(priceFilter.tickSize)
          : s.quoteAssetPrecision
        const qtyPrecision = lotFilter
          ? this.countDecimals(lotFilter.stepSize)
          : s.baseAssetPrecision

        return {
          symbol: s.symbol,
          exchange: this.id,
          baseAsset: s.baseAsset,
          quoteAsset: s.quoteAsset,
          type: 'spot',
          pricePrecision,
          quantityPrecision: qtyPrecision,
          minQuantity: lotFilter ? parseFloat(lotFilter.stepSize) : undefined,
          minNotional: minNotionalFilter ? parseFloat(minNotionalFilter.minNotional) : undefined,
        }
      })

    this.instrumentCache = instruments
    this.instrumentCacheTime = now
    return instruments
  }

  async getInstrument(symbol: string): Promise<Instrument | null> {
    const instruments = await this.getInstruments()
    return instruments.find((i) => i.symbol === symbol) ?? null
  }

  // --- REST data ---

  async getTick(symbol: string): Promise<TickData> {
    const pair = await this.resolveSymbol(symbol)
    const response = await fetch(`${REST_BASE}/api/v3/ticker/24hr?symbol=${pair}`)
    if (!response.ok) {
      throw new Error(`Binance ticker 24hr failed for ${symbol}: ${response.status}`)
    }
    const data = (await response.json()) as BinanceTicker24hr
    return this.mapTicker(data)
  }

  async getOrderBook(symbol: string, limit = 20): Promise<OrderBookData> {
    const pair = await this.resolveSymbol(symbol)
    const response = await fetch(
      `${REST_BASE}/api/v3/depth?symbol=${pair}&limit=${limit}`,
    )
    if (!response.ok) {
      throw new Error(`Binance depth failed for ${symbol}: ${response.status}`)
    }
    const data = (await response.json()) as BinanceOrderBook
    return {
      symbol,
      timestamp: Date.now(),
      bids: data.bids.map(([price, qty]): OrderBookLevel => ({
        price: parseFloat(price),
        quantity: parseFloat(qty),
      })),
      asks: data.asks.map(([price, qty]): OrderBookLevel => ({
        price: parseFloat(price),
        quantity: parseFloat(qty),
      })),
    }
  }

  async getCandles(
    symbol: string,
    timeframe: Timeframe,
    options?: { limit?: number; startTime?: number; endTime?: number },
  ): Promise<CandleData[]> {
    const pair = await this.resolveSymbol(symbol)
    const params = new URLSearchParams({
      symbol: pair,
      interval: timeframe,
    })
    if (options?.limit) params.set('limit', String(options.limit))
    if (options?.startTime) params.set('startTime', String(options.startTime))
    if (options?.endTime) params.set('endTime', String(options.endTime))

    const response = await fetch(`${REST_BASE}/api/v3/klines?${params.toString()}`)
    if (!response.ok) {
      throw new Error(`Binance klines failed for ${symbol}: ${response.status}`)
    }
    const data = (await response.json()) as BinanceKline[]
    return data.map((k): CandleData => ({
      timestamp: k[0],
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
    }))
  }

  async getRecentTrades(symbol: string, limit = 500): Promise<TradeData[]> {
    const pair = await this.resolveSymbol(symbol)
    const response = await fetch(
      `${REST_BASE}/api/v3/trades?symbol=${pair}&limit=${limit}`,
    )
    if (!response.ok) {
      throw new Error(`Binance trades failed for ${symbol}: ${response.status}`)
    }
    const data = (await response.json()) as BinanceTrade[]
    return data.map((t): TradeData => ({
      id: String(t.id),
      symbol,
      price: parseFloat(t.price),
      quantity: parseFloat(t.qty),
      side: t.isBuyerMaker ? 'sell' : 'buy',
      timestamp: t.time,
    }))
  }

  // --- WebSocket subscriptions ---

  async subscribeTicks(symbol: string, callback: (tick: TickData) => void): Promise<() => void> {
    const ws = this.ensureWebSocket()
    const channel = `${symbol.toLowerCase()}@ticker`
    return ws.subscribe(channel, (raw) => {
      const data = raw as BinanceWsMiniTicker
      callback({
        timestamp: data.E,
        symbol: data.s,
        bidPrice: 0, // mini ticker doesn't have bid/ask
        bidSize: 0,
        askPrice: 0,
        askSize: 0,
        lastPrice: parseFloat(data.c),
        change24h: parseFloat(data.o) > 0 ? (parseFloat(data.c) - parseFloat(data.o)) / parseFloat(data.o) : 0,
        volume24h: parseFloat(data.v),
      })
    })
  }

  async subscribeCandles(
    symbol: string,
    timeframe: Timeframe,
    callback: (candle: CandleData, symbol: string) => void,
  ): Promise<() => void> {
    const ws = this.ensureWebSocket()
    const channel = `${symbol.toLowerCase()}@kline_${timeframe}`
    return ws.subscribe(channel, (raw) => {
      const data = raw as BinanceWsKline
      const k = data.k
      // Only emit on close for completed candles, or emit every update?
      // For real-time strategies we emit every update.
      callback(
        {
          timestamp: k.t,
          open: parseFloat(k.o),
          high: parseFloat(k.h),
          low: parseFloat(k.l),
          close: parseFloat(k.c),
          volume: parseFloat(k.v),
        },
        symbol,
      )
    })
  }

  async subscribeOrderBook(
    symbol: string,
    callback: (orderBook: OrderBookData) => void,
  ): Promise<() => void> {
    const ws = this.ensureWebSocket()
    // Use 20-level depth for efficiency
    const channel = `${symbol.toLowerCase()}@depth20@100ms`
    return ws.subscribe(channel, (raw) => {
      const data = raw as BinanceWsDepth
      callback({
        symbol: data.s,
        timestamp: data.E,
        bids: data.b.map(([price, qty]): OrderBookLevel => ({
          price: parseFloat(price),
          quantity: parseFloat(qty),
        })),
        asks: data.a.map(([price, qty]): OrderBookLevel => ({
          price: parseFloat(price),
          quantity: parseFloat(qty),
        })),
      })
    })
  }

  async subscribeTrades(
    symbol: string,
    callback: (trade: TradeData) => void,
  ): Promise<() => void> {
    const ws = this.ensureWebSocket()
    const channel = `${symbol.toLowerCase()}@trade`
    return ws.subscribe(channel, (raw) => {
      const data = raw as BinanceWsTrade
      callback({
        id: String(data.t),
        symbol: data.s,
        price: parseFloat(data.p),
        quantity: parseFloat(data.q),
        side: data.m ? 'sell' : 'buy',
        timestamp: data.T,
      })
    })
  }

  // --- Internal helpers ---

  private ensureWebSocket(): WebSocketManager {
    if (!this.ws) {
      this.ws = new WebSocketManager(WS_BASE)
      this.ws.connect().catch(() => {
        console.warn('[Binance] WebSocket connection failed, will retry')
      })
    }
    return this.ws
  }

  private mapTicker(data: BinanceTicker24hr): TickData {
    return {
      timestamp: Date.now(),
      symbol: data.symbol,
      bidPrice: parseFloat(data.bidPrice),
      bidSize: parseFloat(data.bidQty),
      askPrice: parseFloat(data.askPrice),
      askSize: parseFloat(data.askQty),
      lastPrice: parseFloat(data.lastPrice),
      change24h: parseFloat(data.priceChangePercent) / 100,
      volume24h: parseFloat(data.volume),
    }
  }

  private countDecimals(value: string): number {
    if (value.includes('.')) {
      return value.split('.')[1]!.replace(/0+$/, '').length
    }
    return 0
  }
}
