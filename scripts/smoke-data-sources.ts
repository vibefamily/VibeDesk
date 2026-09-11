/**
 * Smoke test: verify the three new market data providers return
 * real data from their public endpoints.
 *
 * Run: pnpm tsx scripts/smoke-data-sources.ts
 */

import { RobinhoodProvider } from '../packages/data-sources/src/index.ts'
import { YahooFinanceProvider } from '../packages/data-sources/src/index.ts'
import { HyperliquidProvider } from '../packages/data-sources/src/index.ts'

async function main(): Promise<void> {
  console.log('=== RobinhoodProvider (TSLA) ===')
  try {
    const rh = new RobinhoodProvider()
    const tick = await rh.getTick('TSLA')
    console.log('  last:', tick.lastPrice, 'bid:', tick.bidPrice, 'ask:', tick.askPrice, 'chg24h:', tick.change24h)
    console.log('  instruments:', (await rh.getInstruments()).length)
  } catch (err) {
    console.error('  FAILED:', err instanceof Error ? err.message : err)
  }

  console.log('=== YahooFinanceProvider (TSLA) ===')
  try {
    const yf = new YahooFinanceProvider()
    const tick = await yf.getTick('TSLA')
    console.log('  last:', tick.lastPrice, 'chg24h:', tick.change24h, 'vol24h:', tick.volume24h)
    const candles = await yf.getCandles('TSLA', '1d', { limit: 5 })
    console.log('  candles:', candles.length, 'last close:', candles.at(-1)?.close)
  } catch (err) {
    console.error('  FAILED:', err instanceof Error ? err.message : err)
  }

  console.log('=== HyperliquidProvider (BTC, perp) ===')
  try {
    const hl = new HyperliquidProvider()
    const tick = await hl.getTick('BTC')
    console.log('  last:', tick.lastPrice, 'bid:', tick.bidPrice, 'ask:', tick.askPrice, 'chg24h:', tick.change24h, 'vol24h:', tick.volume24h)
    const book = await hl.getOrderBook('BTC', 3)
    console.log('  book bids:', book.bids.length, 'asks:', book.asks.length)
    const candles = await hl.getCandles('BTC', '1h', { limit: 3 })
    console.log('  candles:', candles.length, 'last close:', candles.at(-1)?.close)
    const trades = await hl.getRecentTrades('BTC', 3)
    console.log('  trades:', trades.length)
  } catch (err) {
    console.error('  FAILED:', err instanceof Error ? err.message : err)
  }

  console.log('=== HyperliquidProvider (TSLA - expected to fail, no active stock market) ===')
  try {
    const hl = new HyperliquidProvider()
    await hl.getTick('TSLA')
    console.log('  UNEXPECTED SUCCESS')
  } catch (err) {
    console.log('  expected failure OK:', err instanceof Error ? err.message : err)
  }
}

void main()
