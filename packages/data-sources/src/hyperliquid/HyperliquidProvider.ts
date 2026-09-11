/**
 * Hyperliquid market data provider.
 *
 * Serves perp futures market data (crypto universe) from Hyperliquid's
 * public Info API - no API key or authentication required.
 *
 *   REST:  POST https://api.hyperliquid.xyz/info
 *   WS:    wss://api.hyperliquid.xyz/ws
 *
 * Note: Hyperliquid lists stock tokens in its spot metadata but they
 * currently have no active trading markets, so this provider only
 * surfaces the perp universe. Stock tickers simply return "not found".
 */

import type { CandleData, Instrument, OrderBookData, OrderBookLevel, TickData, TradeData } from '@vibe/shared'
import type { IMarketDataProvider, Timeframe } from '@vibe/core'
import { HyperliquidWebSocketManager } from './HyperliquidWebSocketManager'

const REST_BASE = 'https://api.hyperliquid.xyz'
const WS_BASE = 'wss://api.hyperliquid.xyz/ws'

// --- Raw response types ---

interface HlUniverseItem {
  name?: string
  szDecimals?: number
  maxLeverage?: number
  isDelisted?: boolean
}

interface HlMeta {
  universe?: HlUniverseItem[]
}

interface HlAssetCtx {
  prevDayPx?: string
  dayNtlVlm?: string
  markPx?: string
  midPx?: string
  openInterest?: string
  funding?: string
}

interface HlMetaAndAssetCtxs {
  universe?: HlUniverseItem[]
  assetCtxs?: HlAssetCtx[]
}

/** Actual wire format: [ {universe, ...}, HlAssetCtx[] ] */
type HlMetaAndAssetCtxsWire = [HlMetaAndAssetCtxs, HlAssetCtx[]]

interface HlAllMids {
  [coin: string]: string | undefined
}

type HlBookLevel = [string, string, number] | { px: string; sz: string; n: number }

interface HlL2Book {
  levels?: [HlBookLevel[], HlBookLevel[]]
}

interface HlCandle {
  t?: number
  o?: string
  h?: string
  l?: string
  c?: string
  v?: string
}

interface HlTrade {
  tid?: number
  px?: string
  sz?: string
  side?: 'B' | 'A'
  time?: number
}

interface HlWsAllMids {
  mids?: Record<string, string>
}

interface HlWsCandle {
  coin?: string
  i?: string
  t?: number
  c?: { o?: string; h?: string; l?: string; c?: string; v?: string }
}

interface HlWsTrades {
  coin?: string
  trades?: HlTrade[]
}

interface HlWsL2Book {
  coin?: string
  levels?: [HlBookLevel[], HlBookLevel[]]
}

const CACHE_TTL_MS = 3_000

function num(value: string | number | undefined): number {
  return typeof value === 'number' ? value : parseFloat(value ?? '0')
}

function levelToLevel(level: HlBookLevel): OrderBookLevel {
  if (Array.isArray(level)) {
    return { price: parseFloat(level[0]), quantity: parseFloat(level[1]) }
  }
  return { price: parseFloat(level.px), quantity: parseFloat(level.sz) }
}

/**
 * Hyperliquid perp market data provider.
 */
export class HyperliquidProvider implements IMarketDataProvider {
  readonly id = 'hyperliquid'
  private ws: HyperliquidWebSocketManager | null = null
  private instrumentCache: Instrument[] = []
  private instrumentCacheTime = 0

  private ctxCache: HlAssetCtx[] = []
  private ctxUniverse: HlUniverseItem[] = []
  private ctxCacheTime = 0

  private midsCache: Record<string, string | undefined> = {}
  private midsCacheTime = 0

  private allMidsSubscribed = false
  private tickSubscribers = new Map<string, Set<(tick: TickData) => void>>()

  get isConnected(): boolean {
    return this.ws?.isConnected ?? false
  }

  async connect(): Promise<void> {
    this.ws = new HyperliquidWebSocketManager(WS_BASE)
    try {
      await this.ws.connect()
    } catch {
      // REST still works without WS.
    }
  }

  async disconnect(): Promise<void> {
    this.ws?.disconnect()
    this.ws = null
    this.allMidsSubscribed = false
    this.tickSubscribers.clear()
  }

  // --- Instrument metadata ---

  async getInstruments(): Promise<Instrument[]> {
    const now = Date.now()
    if (this.instrumentCache.length > 0 && now - this.instrumentCacheTime < 3600_000) {
      return this.instrumentCache
    }
    const meta = await this.info<HlMeta>({ type: 'meta' })
    const instruments: Instrument[] = (meta.universe ?? [])
      .filter((u) => !u.isDelisted)
      .map((u): Instrument => ({
        symbol: u.name ?? '',
        exchange: this.id,
        baseAsset: u.name ?? '',
        quoteAsset: 'USD',
        type: 'futures',
        pricePrecision: 6,
        quantityPrecision: u.szDecimals ?? 4,
        maxLeverage: u.maxLeverage,
      }))
      .filter((i) => i.symbol.length > 0)
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
    const ctx = await this.findAssetCtx(symbol)
    if (!ctx) {
      throw new Error(`Hyperliquid: unknown asset "${symbol}"`)
    }
    const last = num(ctx.midPx ?? ctx.markPx)
    const prevDay = num(ctx.prevDayPx)
    // Best bid/ask from the live L2 book.
    let bid = 0
    let ask = 0
    try {
      const book = await this.getOrderBook(symbol, 1)
      bid = book.bids[0]?.price ?? 0
      ask = book.asks[0]?.price ?? 0
    } catch {
      // Book unavailable - mid price still valid.
    }
    return {
      timestamp: Date.now(),
      symbol,
      bidPrice: bid,
      bidSize: 0,
      askPrice: ask,
      askSize: 0,
      lastPrice: last,
      change24h: prevDay > 0 ? (last - prevDay) / prevDay : undefined,
      volume24h: num(ctx.dayNtlVlm),
    }
  }

  async getOrderBook(symbol: string, limit = 20): Promise<OrderBookData> {
    const book = await this.info<HlL2Book>({ type: 'l2Book', coin: symbol })
    if (!book.levels) {
      throw new Error(`Hyperliquid: no order book for "${symbol}"`)
    }
    const [bids, asks] = book.levels
    return {
      symbol,
      timestamp: Date.now(),
      bids: (bids ?? []).slice(0, limit).map(levelToLevel),
      asks: (asks ?? []).slice(0, limit).map(levelToLevel),
    }
  }

  async getCandles(
    symbol: string,
    timeframe: Timeframe,
    options?: { limit?: number; startTime?: number; endTime?: number },
  ): Promise<CandleData[]> {
    const endTime = options?.endTime ?? Date.now()
    const startTime =
      options?.startTime ?? endTime - 300 * 60_000 // default: last 300 candles worth
    const req = {
      coin: symbol,
      interval: timeframe,
      startTime,
      endTime,
    }
    const candles = await this.info<HlCandle[]>({ type: 'candleSnapshot', req })
    let result = candles.map((c): CandleData => ({
      timestamp: c.t ?? 0,
      open: num(c.o),
      high: num(c.h),
      low: num(c.l),
      close: num(c.c),
      volume: num(c.v),
    }))
    if (options?.limit && result.length > options.limit) {
      result = result.slice(-options.limit)
    }
    return result
  }

  async getRecentTrades(symbol: string, limit = 500): Promise<TradeData[]> {
    const trades = await this.info<HlTrade[]>({ type: 'recentTrades', coin: symbol })
    return (trades ?? []).slice(0, limit).map((t): TradeData => ({
      id: String(t.tid ?? ''),
      symbol,
      price: num(t.px),
      quantity: num(t.sz),
      side: t.side === 'B' ? 'buy' : 'sell',
      timestamp: t.time ?? Date.now(),
    }))
  }

  // --- WebSocket subscriptions ---

  async subscribeTicks(symbol: string, callback: (tick: TickData) => void): Promise<() => void> {
    const key = symbol
    let subs = this.tickSubscribers.get(key)
    if (!subs) {
      subs = new Set()
      this.tickSubscribers.set(key, subs)
    }
    subs.add(callback)
    await this.ensureAllMidsSubscription()
    // Emit immediately from cache if available.
    const mid = await this.getMid(key)
    if (mid > 0) {
      callback({ timestamp: Date.now(), symbol: key, bidPrice: 0, bidSize: 0, askPrice: 0, askSize: 0, lastPrice: mid })
    }
    return () => {
      const s = this.tickSubscribers.get(key)
      s?.delete(callback)
      if (s && s.size === 0) {
        this.tickSubscribers.delete(key)
      }
    }
  }

  async subscribeCandles(
    symbol: string,
    timeframe: Timeframe,
    callback: (candle: CandleData, symbol: string) => void,
  ): Promise<() => void> {
    const ws = this.ensureWebSocket()
    const channel = `candle:${symbol}:${timeframe}`
    return ws.subscribe(channel, (raw) => {
      const data = raw as HlWsCandle
      callback(
        {
          timestamp: data.t ?? 0,
          open: num(data.c?.o),
          high: num(data.c?.h),
          low: num(data.c?.l),
          close: num(data.c?.c),
          volume: num(data.c?.v),
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
    const channel = `l2Book:${symbol}`
    return ws.subscribe(channel, (raw) => {
      const data = raw as HlWsL2Book
      if (!data.levels) {
        return
      }
      const [bids, asks] = data.levels
      callback({
        symbol: data.coin ?? symbol,
        timestamp: Date.now(),
        bids: (bids ?? []).map(levelToLevel),
        asks: (asks ?? []).map(levelToLevel),
      })
    })
  }

  async subscribeTrades(
    symbol: string,
    callback: (trade: TradeData) => void,
  ): Promise<() => void> {
    const ws = this.ensureWebSocket()
    const channel = `trades:${symbol}`
    return ws.subscribe(channel, (raw) => {
      const data = raw as HlWsTrades
      for (const t of data.trades ?? []) {
        callback({
          id: String(t.tid ?? ''),
          symbol: data.coin ?? symbol,
          price: num(t.px),
          quantity: num(t.sz),
          side: t.side === 'B' ? 'buy' : 'sell',
          timestamp: t.time ?? Date.now(),
        })
      }
    })
  }

  // --- Internal helpers ---

  private async info<T>(body: unknown): Promise<T> {
    const response = await fetch(`${REST_BASE}/info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!response.ok) {
      throw new Error(`Hyperliquid info failed: ${response.status}`)
    }
    return (await response.json()) as T
  }

  private async refreshCtxCache(): Promise<void> {
    const now = Date.now()
    if (now - this.ctxCacheTime < CACHE_TTL_MS) {
      return
    }
    const data = await this.info<HlMetaAndAssetCtxsWire>({ type: 'metaAndAssetCtxs' })
    this.ctxUniverse = data[0]?.universe ?? []
    this.ctxCache = data[1] ?? []
    this.ctxCacheTime = now
  }

  private async findAssetCtx(symbol: string): Promise<HlAssetCtx | undefined> {
    await this.refreshCtxCache()
    const index = this.ctxUniverse.findIndex((u) => u.name === symbol)
    if (index < 0) {
      return undefined
    }
    return this.ctxCache[index]
  }

  private async getMid(symbol: string): Promise<number> {
    const now = Date.now()
    if (now - this.midsCacheTime > CACHE_TTL_MS) {
      const mids = await this.info<HlAllMids>({ type: 'allMids' })
      this.midsCache = mids
      this.midsCacheTime = now
    }
    return num(this.midsCache[symbol])
  }

  private async ensureAllMidsSubscription(): Promise<void> {
    if (this.allMidsSubscribed) {
      return
    }
    const ws = this.ensureWebSocket()
    await ws.subscribe('allMids', (raw) => {
      const data = raw as HlWsAllMids
      const mids = data.mids ?? {}
      this.midsCache = { ...this.midsCache, ...mids }
      this.midsCacheTime = Date.now()
      for (const [symbol, subs] of this.tickSubscribers) {
        const mid = num(mids[symbol])
        if (mid <= 0) {
          continue
        }
        for (const cb of subs) {
          cb({ timestamp: Date.now(), symbol, bidPrice: 0, bidSize: 0, askPrice: 0, askSize: 0, lastPrice: mid })
        }
      }
    })
    this.allMidsSubscribed = true
  }

  private ensureWebSocket(): HyperliquidWebSocketManager {
    if (!this.ws) {
      this.ws = new HyperliquidWebSocketManager(WS_BASE)
      this.ws.connect().catch(() => {
        console.warn('[Hyperliquid] WebSocket connection failed, will retry')
      })
    }
    return this.ws
  }
}
