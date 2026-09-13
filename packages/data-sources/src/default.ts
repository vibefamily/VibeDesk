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
    id: 'binance',
    name: 'Binance',
    kind: 'cex',
    assetScope: 'stocks+crypto',
    authRequired: true,
    updateMode: ['rest', 'ws'],
    description: 'Spot market data incl. tokenized stocks (TSLABUSDT). User API key unlocks stock symbols.',
    privacyNote: 'Keys stay in the main process config, never shown or sent out.',
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
]

/** A fully wired aggregator + registry with the built-in providers. */
export interface DefaultDataSources {
  aggregator: MarketDataAggregator
  registry: DataSourceRegistry
}

/** Per-provider config overrides keyed by provider id (e.g. binance api key). */
export interface ProviderConfigs {
  [providerId: string]: Record<string, string>
}

/** Create and connect the default set of providers. */
export async function createDefaultDataSources(
  options: { providerConfigs?: ProviderConfigs } = {},
): Promise<DefaultDataSources> {
  const aggregator = new MarketDataAggregator()
  const registry = new DataSourceRegistry()
  const cfg = options.providerConfigs ?? {}

  const providers = [
    new HyperliquidProvider(),
    new RobinhoodProvider(),
    new BinanceSpotProvider(cfg.binance ?? {}),
    new YahooFinanceProvider(),
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
