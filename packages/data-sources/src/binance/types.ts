/**
 * Binance API response types (spot market data endpoints).
 *
 * These represent the raw wire format from Binance. They are mapped to
 * Vibe's unified types in BinanceSpotProvider.
 */

/** Binance exchange info response */
export interface BinanceExchangeInfo {
  symbols: BinanceSymbol[]
  timezone: string
  serverTime: number
}

export interface BinanceSymbol {
  symbol: string
  status: string
  baseAsset: string
  quoteAsset: string
  baseAssetPrecision: number
  quotePrecision: number
  quoteAssetPrecision: number
  baseCommissionPrecision: number
  quoteCommissionPrecision: number
  orderTypes: string[]
  icebergAllowed: boolean
  ocoAllowed: boolean
  quoteOrderQtyMarketAllowed: boolean
  isSpotTradingAllowed: boolean
  isMarginTradingAllowed: boolean
  filters: BinanceFilter[]
  permissions: string[]
}

interface BinanceFilter {
  filterType: string
  [key: string]: unknown
}

/** Binance 24hr ticker response */
export interface BinanceTicker24hr {
  symbol: string
  priceChange: string
  priceChangePercent: string
  weightedAvgPrice: string
  prevClosePrice: string
  lastPrice: string
  lastQty: string
  bidPrice: string
  bidQty: string
  askPrice: string
  askQty: string
  openPrice: string
  highPrice: string
  lowPrice: string
  volume: string
  quoteVolume: string
  openTime: number
  closeTime: number
  firstId: number
  lastId: number
  count: number
}

/** Binance order book response */
export interface BinanceOrderBook {
  lastUpdateId: number
  bids: Array<[string, string]>
  asks: Array<[string, string]>
}

/** Binance kline/candlestick response */
export type BinanceKline = [
  number, // open time
  string, // open
  string, // high
  string, // low
  string, // close
  string, // volume
  number, // close time
  string, // quote asset volume
  number, // number of trades
  string, // taker buy base asset volume
  string, // taker buy quote asset volume
  string, // ignore
]

/** Binance recent trades response */
export interface BinanceTrade {
  id: number
  price: string
  qty: string
  quoteQty: string
  time: number
  isBuyerMaker: boolean
  isBestMatch: boolean
}

// --- WebSocket message types ---

/** Binance mini ticker stream */
export interface BinanceWsMiniTicker {
  e: string  // event type
  E: number  // event time
  s: string  // symbol
  c: string  // close price
  o: string  // open price
  h: string  // high price
  l: string  // low price
  v: string  // total traded base asset volume
  q: string  // total traded quote asset volume
}

/** Binance trade stream */
export interface BinanceWsTrade {
  e: string
  E: number
  s: string
  t: number  // trade id
  p: string  // price
  q: string  // quantity
  b: number  // buyer order id
  a: number  // seller order id
  T: number  // trade time
  m: boolean // is buyer maker
  M: boolean
}

/** Binance kline stream */
export interface BinanceWsKline {
  e: string
  E: number
  s: string
  k: {
    t: number  // start time
    T: number  // close time
    s: string  // symbol
    i: string  // interval
    f: number  // first trade id
    L: number  // last trade id
    o: string  // open
    c: string  // close
    h: string  // high
    l: string  // low
    v: string  // base asset volume
    n: number  // number of trades
    x: boolean // is this kline closed
    q: string  // quote asset volume
    V: string  // taker buy base asset volume
    Q: string  // taker buy quote asset volume
    B: string  // ignore
  }
}

/** Binance partial book depth stream */
export interface BinanceWsDepth {
  e: string
  E: number
  s: string
  U: number  // first update id
  u: number  // final update id
  b: Array<[string, string]> // bids
  a: Array<[string, string]> // asks
}
