/**
 * Market data module - unified market data access layer.
 */

export { MarketDataAggregator } from './MarketDataAggregator'
export type {
  IMarketDataProvider,
  IMarketDataAggregator,
  Timeframe,
  TickCallback,
  CandleCallback,
  OrderBookCallback,
  TradeCallback,
} from './types'
