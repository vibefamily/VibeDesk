/**
 * Yahoo Finance market data provider.
 *
 * Uses Yahoo Finance's public chart API (no authentication) as a second
 * independent equity price source for cross-source comparison. Serves
 * real-time quotes and historical candles for US stocks.
 */

import type { CandleData, Instrument, OrderBookData, TickData, TradeData } from '@vibe/shared'
import { DEFAULT_STOCK_TICKERS } from '@vibe/shared'
import type { IMarketDataProvider, Timeframe } from '@vibe/core'

const CHART_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart/'

interface YahooMeta {
  symbol?: string
  regularMarketPrice?: number
  regularMarketChangePercent?: number
  regularMarketTime?: number
  regularMarketVolume?: number
  currency?: string
  exchangeName?: string
  fullExchangeName?: string
  instrumentType?: string
}

interface YahooResult {
  meta?: YahooMeta
  timestamp?: number[]
  indicators?: {
    quote?: Array<{
      open?: Array<number | null>
      high?: Array<number | null>
      low?: Array<number | null>
      close?: Array<number | null>
      volume?: Array<number | null>
    }>
  }
}

interface YahooChartResponse {
  chart?: {
    result?: YahooResult[]
    error?: unknown
  }
}

const DEFAULT_TIMEFRAME_RANGE: Record<string, [string, string]> = {
  '1m': ['1d', '1m'],
  '5m': ['5d', '5m'],
  '15m': ['1mo', '15m'],
  '1h': ['1mo', '1h'],
  '4h': ['3mo', '1h'],
  '1d': ['1y', '1d'],
  '1w': ['2y', '1wk'],
}

/**
 * Yahoo Finance provider.
 *
 * Serves quotes and candles from Yahoo's public chart endpoint.
 * No API key required.
 */
export class YahooFinanceProvider implements IMarketDataProvider {
  readonly id = 'yahoo'
  private _isConnected = false
  private pollTimers = new Map<string, ReturnType<typeof setInterval>>()

  get isConnected(): boolean {
    return this._isConnected
  }

  async connect(): Promise<void> {
    try {
      await this.getTick(DEFAULT_STOCK_TICKERS[0] ?? 'TSLA')
      this._isConnected = true
    } catch {
      this._isConnected = true
    }
  }

  async disconnect(): Promise<void> {
    for (const timer of this.pollTimers.values()) {
      clearInterval(timer)
    }
    this.pollTimers.clear()
    this._isConnected = false
  }

  // --- Instrument metadata ---

  async getInstruments(): Promise<Instrument[]> {
    return DEFAULT_STOCK_TICKERS.map((ticker): Instrument => ({
      symbol: ticker,
      exchange: this.id,
      baseAsset: ticker,
      quoteAsset: 'USD',
      type: 'stock_token',
      pricePrecision: 4,
      quantityPrecision: 0,
    }))
  }

  async getInstrument(symbol: string): Promise<Instrument | null> {
    const instruments = await this.getInstruments()
    return instruments.find((i) => i.symbol === symbol.toUpperCase()) ?? null
  }

  // --- REST data ---

  async getTick(symbol: string): Promise<TickData> {
    const result = await this.fetchChart(symbol, '1d', '5m')
    const meta = result?.meta
    if (!meta || typeof meta.regularMarketPrice !== 'number') {
      throw new Error(`Yahoo: no quote data for ${symbol}`)
    }
    const last = meta.regularMarketPrice
    return {
      timestamp: meta.regularMarketTime ? meta.regularMarketTime * 1000 : Date.now(),
      symbol,
      bidPrice: 0,
      bidSize: 0,
      askPrice: 0,
      askSize: 0,
      lastPrice: last,
      change24h:
        typeof meta.regularMarketChangePercent === 'number'
          ? meta.regularMarketChangePercent / 100
          : undefined,
      volume24h: meta.regularMarketVolume,
    }
  }

  async getCandles(
    symbol: string,
    timeframe: Timeframe,
    options?: { limit?: number; startTime?: number; endTime?: number },
  ): Promise<CandleData[]> {
    const [range, interval] = DEFAULT_TIMEFRAME_RANGE[timeframe] ?? ['1d', '15m']
    const result = await this.fetchChart(symbol, range, interval)
    const timestamps = result?.timestamp ?? []
    const quote = result?.indicators?.quote?.[0]
    const candles: CandleData[] = []
    for (let i = 0; i < timestamps.length; i++) {
      const close = quote?.close?.[i]
      if (close === null || close === undefined) {
        continue
      }
      candles.push({
        timestamp: timestamps[i]! * 1000,
        open: quote?.open?.[i] ?? close,
        high: quote?.high?.[i] ?? close,
        low: quote?.low?.[i] ?? close,
        close,
        volume: quote?.volume?.[i] ?? 0,
      })
    }
    if (options?.limit && candles.length > options.limit) {
      return candles.slice(-options.limit)
    }
    return candles
  }

  async getOrderBook(_symbol: string, _limit = 20): Promise<OrderBookData> {
    throw new Error('Yahoo Finance public API does not expose order books.')
  }

  async getRecentTrades(_symbol: string, _limit = 500): Promise<TradeData[]> {
    throw new Error('Yahoo Finance public API does not expose trades.')
  }

  // --- WebSocket subscriptions (polling fallback) ---

  async subscribeTicks(symbol: string, callback: (tick: TickData) => void): Promise<() => void> {
    const key = symbol.toUpperCase()
    const poll = async (): Promise<void> => {
      try {
        const tick = await this.getTick(key)
        callback(tick)
      } catch {
        // Transient polling errors are ignored; next poll retries.
      }
    }
    void poll()
    const timer = setInterval(() => void poll(), 10_000)
    this.pollTimers.set(key, timer)
    return () => {
      const t = this.pollTimers.get(key)
      if (t) {
        clearInterval(t)
        this.pollTimers.delete(key)
      }
    }
  }

  async subscribeCandles(
    _symbol: string,
    _timeframe: Timeframe,
    _callback: (candle: CandleData, symbol: string) => void,
  ): Promise<() => void> {
    throw new Error('Yahoo Finance public API does not support candle streams.')
  }

  async subscribeOrderBook(
    _symbol: string,
    _callback: (orderBook: OrderBookData) => void,
  ): Promise<() => void> {
    throw new Error('Yahoo Finance public API does not support order book streams.')
  }

  async subscribeTrades(
    _symbol: string,
    _callback: (trade: TradeData) => void,
  ): Promise<() => void> {
    throw new Error('Yahoo Finance public API does not support trade streams.')
  }

  // --- Internal helpers ---

  private async fetchChart(
    symbol: string,
    range: string,
    interval: string,
  ): Promise<YahooResult | undefined> {
    const url = `${CHART_BASE}${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`
    const response = await fetch(url, {
      headers: { 'User-Agent': 'VibeDesk/0.1' },
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) {
      throw new Error(`Yahoo chart failed for ${symbol}: ${response.status}`)
    }
    const data = (await response.json()) as YahooChartResponse
    if (data.chart?.error) {
      throw new Error(`Yahoo chart error for ${symbol}: ${JSON.stringify(data.chart.error)}`)
    }
    return data.chart?.result?.[0]
  }
}
