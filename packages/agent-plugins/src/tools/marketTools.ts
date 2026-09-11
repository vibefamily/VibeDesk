/**
 * Market data tools for agents.
 *
 * Exposes market data functionality as LLM-callable tools.
 */

import type { MarketDataAggregator } from '@vibe/core'
import type { ToolDefinition } from '../runtime/types'

/**
 * Create market data tools that query a MarketDataAggregator.
 */
export function createMarketTools(market: MarketDataAggregator): ToolDefinition[] {
  return [
    {
      name: 'get_price',
      description: 'Get the current price and 24h stats for a trading symbol (e.g., BTCUSDT, ETHUSDT).',
      parameters: {
        type: 'object',
        properties: {
          symbol: {
            type: 'string',
            description: 'Trading pair symbol, e.g., BTCUSDT, ETHUSDT, SOLUSDT',
          },
          provider: {
            type: 'string',
            description: 'Optional data provider ID (e.g., binance). Defaults to best available.',
          },
        },
        required: ['symbol'],
      },
      execute: async (args) => {
        const symbol = String(args.symbol ?? '').toUpperCase()
        if (!symbol) {
          return { success: false, content: 'Error: symbol is required.' }
        }
        try {
          const tick = await market.getTick(symbol, args.provider as string | undefined)
          return {
            success: true,
            content:
              `Price for ${tick.symbol}:\n` +
              `  Last: ${tick.lastPrice}\n` +
              `  Bid: ${tick.bidPrice}\n` +
              `  Ask: ${tick.askPrice}\n` +
              `  24h Change: ${((tick.change24h ?? 0) * 100).toFixed(2)}%\n` +
              `  24h Volume: ${tick.volume24h ?? 'N/A'}`,
            data: tick,
          }
        } catch (err) {
          return {
            success: false,
            content: `Error fetching price for ${symbol}: ${err instanceof Error ? err.message : String(err)}`,
          }
        }
      },
    },

    {
      name: 'get_orderbook',
      description: 'Get the current order book (bids and asks) for a symbol.',
      parameters: {
        type: 'object',
        properties: {
          symbol: { type: 'string', description: 'Trading pair symbol' },
          limit: { type: 'number', description: 'Number of levels to return (default 20)' },
        },
        required: ['symbol'],
      },
      execute: async (args) => {
        const symbol = String(args.symbol ?? '').toUpperCase()
        const limit = Number(args.limit ?? 20)
        try {
          const book = await market.getOrderBook(symbol, limit)
          const topBids = book.bids.slice(0, 5)
          const topAsks = book.asks.slice(0, 5)
          const fmt = (p: { price: number; quantity: number }) =>
            `${p.price.toFixed(2)} @ ${p.quantity.toFixed(4)}`
          return {
            success: true,
            content:
              `Order book for ${symbol} (top 5):\n` +
              `Bids:\n${topBids.map((b) => `  ${fmt(b)}`).join('\n')}\n` +
              `Asks:\n${topAsks.map((a) => `  ${fmt(a)}`).join('\n')}`,
            data: book,
          }
        } catch (err) {
          return {
            success: false,
            content: `Error fetching order book: ${err instanceof Error ? err.message : String(err)}`,
          }
        }
      },
    },

    {
      name: 'get_candles',
      description: 'Get historical K-line / candle data for a symbol and timeframe.',
      parameters: {
        type: 'object',
        properties: {
          symbol: { type: 'string', description: 'Trading pair symbol' },
          timeframe: {
            type: 'string',
            description: 'Timeframe: 1m, 5m, 15m, 1h, 4h, 1d',
            enum: ['1m', '5m', '15m', '1h', '4h', '1d'],
          },
          limit: { type: 'number', description: 'Number of candles (default 100)' },
        },
        required: ['symbol'],
      },
      execute: async (args) => {
        const symbol = String(args.symbol ?? '').toUpperCase()
        const timeframe = (args.timeframe as string) ?? '1h'
        const limit = Number(args.limit ?? 100)
        try {
          const candles = await market.getCandles(symbol, timeframe as never, { limit })
          const recent = candles.slice(-5)
          return {
            success: true,
            content:
              `${candles.length} candles for ${symbol} ${timeframe}.\n` +
              `Last 5 closes:\n` +
              recent
                .map(
                  (c) =>
                    `  ${new Date(c.timestamp).toISOString()}: O=${c.open.toFixed(2)} H=${c.high.toFixed(2)} L=${c.low.toFixed(2)} C=${c.close.toFixed(2)}`,
                )
                .join('\n'),
            data: candles,
          }
        } catch (err) {
          return {
            success: false,
            content: `Error fetching candles: ${err instanceof Error ? err.message : String(err)}`,
          }
        }
      },
    },

    {
      name: 'compare_prices',
      description:
        'Compare the price of a symbol across all available data sources / exchanges. Useful for finding price differences and arbitrage opportunities.',
      parameters: {
        type: 'object',
        properties: {
          symbol: {
            type: 'string',
            description: 'Trading pair symbol to compare across providers',
          },
        },
        required: ['symbol'],
      },
      execute: async (args) => {
        const symbol = String(args.symbol ?? '').toUpperCase()
        try {
          const ticks = await market.getTicksAll(symbol)
          if (ticks.size === 0) {
            return { success: false, content: `No price data found for ${symbol} across any provider.` }
          }
          const entries = Array.from(ticks.entries()).sort(
            (a, b) => a[1].lastPrice - b[1].lastPrice,
          )
          const lowest = entries[0]
          const highest = entries[entries.length - 1]
          if (!lowest || !highest) {
            return { success: false, content: `No price data found for ${symbol} across any provider.` }
          }
          const spread = highest[1].lastPrice - lowest[1].lastPrice
          const spreadPct = (spread / lowest[1].lastPrice) * 100

          let content = `Price comparison for ${symbol}:\n\n`
          for (const [providerId, tick] of entries) {
            content += `  ${providerId}: $${tick.lastPrice.toFixed(2)} (${((tick.change24h ?? 0) * 100).toFixed(2)}% 24h)\n`
          }
          content += `\nSpread: $${spread.toFixed(2)} (${spreadPct.toFixed(2)}%)\n`
          content += `Lowest: ${lowest[0]} @ $${lowest[1].lastPrice.toFixed(2)}\n`
          content += `Highest: ${highest[0]} @ $${highest[1].lastPrice.toFixed(2)}`

          return { success: true, content, data: Object.fromEntries(ticks) }
        } catch (err) {
          return {
            success: false,
            content: `Error comparing prices: ${err instanceof Error ? err.message : String(err)}`,
          }
        }
      },
    },
  ]
}
