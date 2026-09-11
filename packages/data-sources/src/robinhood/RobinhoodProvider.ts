/**
 * Robinhood equity quote provider.
 *
 * Uses Robinhood's public market-data quote endpoint (no authentication)
 * to serve real-time US equity quotes. This is the traditional-broker
 * price source in the multi-source comparison view.
 *
 * Note: only the public quotes endpoint is used; no account access.
 */

import type { CandleData, Instrument, OrderBookData, TickData, TradeData } from '@vibe/shared'
import { DEFAULT_STOCK_TICKERS, STOCK_TICKER_NAMES } from '@vibe/shared'
import type { IMarketDataProvider, Timeframe } from '@vibe/core'

const QUOTES_BASE = 'https://api.robinhood.com/quotes/'

/** Raw quote object from Robinhood's public quotes endpoint. */
interface RobinhoodQuote {
  ask_price?: string
  bid_price?: string
  last_trade_price?: string
  previous_close?: string
  symbol?: string
  updated_at?: string
}

interface RobinhoodQuotesResponse {
  results?: RobinhoodQuote[]
}

/**
 * Robinhood equity quote provider.
 *
 * Serves real-time quotes for US stocks via Robinhood's public
 * quotes endpoint. No API key required.
 */
export class RobinhoodProvider implements IMarketDataProvider {
  readonly id = 'robinhood'
  private _isConnected = false
  private pollTimers = new Map<string, ReturnType<typeof setInterval>>()

  get isConnected(): boolean {
    return this._isConnected
  }

  async connect(): Promise<void> {
    // Verify the public endpoint is reachable.
    try {
      await this.getTick(DEFAULT_STOCK_TICKERS[0] ?? 'TSLA')
      this._isConnected = true
    } catch {
      // Keep REST usable anyway; connectivity is re-evaluated per call.
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
      minNotional: undefined,
    }))
  }

  async getInstrument(symbol: string): Promise<Instrument | null> {
    const instruments = await this.getInstruments()
    return instruments.find((i) => i.symbol === symbol.toUpperCase()) ?? null
  }

  // --- REST data ---

  async getTick(symbol: string): Promise<TickData> {
    const response = await fetch(`${QUOTES_BASE}?symbols=${encodeURIComponent(symbol)}`, {
      headers: { 'User-Agent': 'VibeDesk/0.1' },
    })
    if (!response.ok) {
      throw new Error(`Robinhood quotes failed for ${symbol}: ${response.status}`)
    }
    const data = (await response.json()) as RobinhoodQuotesResponse
    const quote = data.results?.[0]
    if (!quote) {
      throw new Error(`Robinhood: no quote data for ${symbol}`)
    }
    return this.mapQuote(symbol, quote)
  }

  async getOrderBook(_symbol: string, _limit = 20): Promise<OrderBookData> {
    throw new Error('Robinhood public API does not expose order books.')
  }

  async getCandles(
    _symbol: string,
    _timeframe: Timeframe,
    _options?: { limit?: number; startTime?: number; endTime?: number },
  ): Promise<CandleData[]> {
    throw new Error('Robinhood public API does not expose candle history.')
  }

  async getRecentTrades(_symbol: string, _limit = 500): Promise<TradeData[]> {
    throw new Error('Robinhood public API does not expose recent trades.')
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
    throw new Error('Robinhood public API does not support candle streams.')
  }

  async subscribeOrderBook(
    _symbol: string,
    _callback: (orderBook: OrderBookData) => void,
  ): Promise<() => void> {
    throw new Error('Robinhood public API does not support order book streams.')
  }

  async subscribeTrades(
    _symbol: string,
    _callback: (trade: TradeData) => void,
  ): Promise<() => void> {
    throw new Error('Robinhood public API does not support trade streams.')
  }

  // --- Internal helpers ---

  private mapQuote(symbol: string, quote: RobinhoodQuote): TickData {
    const last = parseFloat(quote.last_trade_price ?? '0')
    const prevClose = parseFloat(quote.previous_close ?? '0')
    const timestamp = quote.updated_at ? new Date(quote.updated_at).getTime() : Date.now()
    return {
      timestamp,
      symbol,
      bidPrice: parseFloat(quote.bid_price ?? '0'),
      bidSize: 0,
      askPrice: parseFloat(quote.ask_price ?? '0'),
      askSize: 0,
      lastPrice: last,
      change24h: prevClose > 0 ? (last - prevClose) / prevClose : undefined,
      volume24h: undefined,
    }
  }
}
