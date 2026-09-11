/**
 * Default provider assembly.
 *
 * Creates a MarketDataAggregator and DataSourceRegistry pre-loaded with the
 * built-in providers, so the desktop app and CLI share one wiring path.
 */

import { MarketDataAggregator } from '@vibe/core'
import { BinanceSpotProvider } from './binance'
import { RobinhoodProvider } from './robinhood'
import { YahooFinanceProvider } from './yahoo'
import { HyperliquidProvider } from './hyperliquid'
import { DataSourceRegistry } from './registry'
import type { ProviderManifest } from './registry'

/** Manifests for the built-in providers. */
export const BUILTIN_MANIFESTS: ProviderManifest[] = [
  {
    id: 'robinhood',
    name: 'Robinhood',
    kind: 'broker',
    assetScope: 'stocks',
    authRequired: false,
    updateMode: ['polling'],
    description: 'US equity quotes from Robinhood public endpoint',
    privacyNote: 'Public quotes endpoint only; no account access.',
  },
  {
    id: 'yahoo',
    name: 'Yahoo Finance',
    kind: 'aggregator',
    assetScope: 'stocks',
    authRequired: false,
    updateMode: ['polling'],
    description: 'US equity quotes & candles from Yahoo public chart API',
    privacyNote: 'Public chart endpoint; no account access.',
  },
  {
    id: 'hyperliquid',
    name: 'Hyperliquid',
    kind: 'dex',
    assetScope: 'crypto',
    authRequired: false,
    updateMode: ['rest', 'ws'],
    description: 'Perp futures from Hyperliquid public Info API',
    privacyNote: 'Public Info API; no API key required.',
  },
  {
    id: 'binance',
    name: 'Binance',
    kind: 'cex',
    assetScope: 'crypto',
    authRequired: false,
    updateMode: ['rest', 'ws'],
    description: 'Spot market data from Binance public API',
    privacyNote: 'Public market data only.',
  },
]

/** A fully wired aggregator + registry with the built-in providers. */
export interface DefaultDataSources {
  aggregator: MarketDataAggregator
  registry: DataSourceRegistry
}

/** Create and connect the default set of providers. */
export async function createDefaultDataSources(): Promise<DefaultDataSources> {
  const aggregator = new MarketDataAggregator()
  const registry = new DataSourceRegistry()

  const providers = [
    new RobinhoodProvider(),
    new YahooFinanceProvider(),
    new HyperliquidProvider(),
    new BinanceSpotProvider(),
  ]

  for (const provider of providers) {
    aggregator.registerProvider(provider)
    const manifest = BUILTIN_MANIFESTS.find((m) => m.id === provider.id)
    if (manifest) {
      registry.register(provider, manifest)
    }
    provider.connect().catch(() => {
      console.warn(`[DataSources] ${provider.id} connect failed (REST fallback active)`)
    })
  }

  return { aggregator, registry }
}
