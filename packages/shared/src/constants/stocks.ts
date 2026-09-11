/**
 * Default stock ticker universe for VibeDesk demo / default watchlist.
 *
 * Shared across providers that serve traditional equity quotes
 * (Robinhood, Yahoo Finance) so the UI can render a consistent
 * stock list regardless of which provider supplies the data.
 */

/** Default stock tickers used as the built-in watchlist. */
export const DEFAULT_STOCK_TICKERS: string[] = [
  'TSLA',
  'NVDA',
  'AAPL',
  'MSFT',
  'GOOGL',
  'AMZN',
  'META',
  'NFLX',
  'HOOD',
  'AMD',
  'INTC',
  'PLTR',
  'SPY',
  'QQQ',
]

/** Map of ticker to a short display name. */
export const STOCK_TICKER_NAMES: Record<string, string> = {
  TSLA: 'Tesla Inc.',
  NVDA: 'NVIDIA Corp.',
  AAPL: 'Apple Inc.',
  MSFT: 'Microsoft Corp.',
  GOOGL: 'Alphabet Inc.',
  AMZN: 'Amazon.com Inc.',
  META: 'Meta Platforms Inc.',
  NFLX: 'Netflix Inc.',
  HOOD: 'Robinhood Markets Inc.',
  AMD: 'Advanced Micro Devices Inc.',
  INTC: 'Intel Corp.',
  PLTR: 'Palantir Technologies Inc.',
  SPY: 'SPDR S&P 500 ETF',
  QQQ: 'Invesco QQQ Trust',
}
