/**
 * Market data store for the renderer.
 *
 * Wires the built-in data sources (Robinhood / Yahoo / Hyperliquid /
 * Binance) into a Zustand store that drives the multi-source price
 * comparison view. Providers run in the renderer because they only
 * depend on fetch + WebSocket, both available in the browser context.
 */

import { create } from 'zustand'
import type { TickData } from '@vibe/shared'
import { DEFAULT_STOCK_TICKERS } from '@vibe/shared'
import { createDefaultDataSources } from '@vibe/data-sources'
import type { DataSourceRegistry } from '@vibe/data-sources'
import type { MarketDataAggregator } from '@vibe/core'

interface MarketState {
  ready: boolean
  error: string | null
  aggregator: MarketDataAggregator | null
  registry: DataSourceRegistry | null
  /** symbol -> providerId -> latest tick */
  ticks: Record<string, Record<string, TickData>>
  /** providers that errored for a symbol (e.g. asset not listed) */
  unavailable: Record<string, string[]>
  loading: boolean
  lastUpdated: number | null
  init: () => Promise<void>
  refreshSymbol: (symbol: string) => Promise<void>
}

let dataSourcesPromise: ReturnType<typeof createDefaultDataSources> | null = null

function getDataSources(): ReturnType<typeof createDefaultDataSources> {
  if (!dataSourcesPromise) {
    dataSourcesPromise = createDefaultDataSources()
  }
  return dataSourcesPromise
}

const subscribedSymbols = new Set<string>()
const pollTimers = new Map<string, ReturnType<typeof setInterval>>()

export const useMarketStore = create<MarketState>((set, get) => ({
  ready: false,
  error: null,
  aggregator: null,
  registry: null,
  ticks: {},
  unavailable: {},
  loading: false,
  lastUpdated: null,

  init: async () => {
    if (get().ready) {
      return
    }
    try {
      const ds = await getDataSources()
      set({ aggregator: ds.aggregator, registry: ds.registry, ready: true })
      // Warm up the stock list so the first render has ticks.
      await get().refreshSymbol(DEFAULT_STOCK_TICKERS[0] ?? 'TSLA')
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
    }
  },

  refreshSymbol: async (symbol) => {
    const { aggregator, ticks, unavailable } = get()
    if (!aggregator) {
      return
    }
    // One-shot snapshot refresh.
    try {
      const all = await aggregator.getTicksAll(symbol)
      const nextTicks: Record<string, TickData> = { ...ticks[symbol] }
      const failed: string[] = []
      for (const providerId of aggregator.listProviders().map((p) => p.id)) {
        const tick = all.get(providerId)
        if (tick) {
          nextTicks[providerId] = tick
        } else {
          failed.push(providerId)
        }
      }
      set({
        ticks: { ...ticks, [symbol]: nextTicks },
        unavailable: { ...unavailable, [symbol]: failed },
        lastUpdated: Date.now(),
      })
    } catch {
      // Snapshot errors are surfaced via the loading state only.
    }

    // Real-time subscription (idempotent per symbol).
    if (subscribedSymbols.has(symbol)) {
      return
    }
    subscribedSymbols.add(symbol)
    for (const provider of aggregator.listProviders()) {
      provider.subscribeTicks(symbol, (tick) => {
        set((state) => ({
          ticks: {
            ...state.ticks,
            [symbol]: { ...state.ticks[symbol], [provider.id]: tick },
          },
          lastUpdated: Date.now(),
        }))
      }).catch(() => {
        // Provider without stream support (throws) - snapshot refresh covers it.
      })
    }
    // Fallback polling every 10s keeps all sources fresh regardless of
    // stream support (Robinhood/Yahoo use polling internally anyway).
    if (pollTimers.has(symbol)) {
      return
    }
    const timer = setInterval(() => {
      const agg = get().aggregator
      if (!agg) {
        return
      }
      agg.getTicksAll(symbol)
        .then((all) => {
          const nextTicks: Record<string, TickData> = { ...get().ticks[symbol] }
          for (const [providerId, tick] of all) {
            nextTicks[providerId] = tick
          }
          set({ ticks: { ...get().ticks, [symbol]: nextTicks }, lastUpdated: Date.now() })
        })
        .catch(() => undefined)
    }, 10_000)
    pollTimers.set(symbol, timer)
  },
}))
